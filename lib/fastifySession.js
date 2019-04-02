'use strict'

const fastifyPlugin = require('fastify-plugin')
const Store = require('./store')
const Session = require('./session')
const metadata = require('./metadata')
const cookieSignature = require('cookie-signature')

function session (fastify, options, next) {
  const error = checkOptions(options)
  if (error) return next(error)

  options = ensureDefaults(options)

  fastify.decorateRequest('sessionStore', options.store)
  fastify.decorateRequest('session', {})
  fastify.addHook('preHandler', preHandler(options))
  fastify.addHook('onSend', onSend(options))
  next()
}

function preHandler (options) {
  const cookieOpts = options.cookie
  const secret = options.secret
  console.log('----- Initializing preHandler', cookieOpts, secret)
  return function handleSession (request, reply, done) {
    const url = request.req.url
    console.log('----- Calling preHandler', url, cookieOpts.path || '/')
    if (url.indexOf(cookieOpts.path || '/') !== 0) {
      done()
      return
    }
    let sessionId = request.cookies[options.cookieName]
    console.log('----- sessionId', sessionId)
    if (!sessionId) {
      console.log('----- new sessionId')
      newSession(secret, request, cookieOpts, done)
    } else {
      console.log('----- old sessionId')
      const decryptedSessionId = cookieSignature.unsign(sessionId, secret)
      console.log('----- decryptedSessionId', decryptedSessionId)
      if (decryptedSessionId === false) {
        console.log('----- new decryptedSessionId')
        newSession(secret, request, cookieOpts, done)
      } else {
        console.log('----- old decryptedSessionId')
        options.store.get(decryptedSessionId, (err, session) => {
          console.log('----- store got decryptedSessionId', err)
          if (err) {
            if (err.code === 'ENOENT') {
              newSession(secret, request, cookieOpts, done)
            } else {
              done(err)
            }
            return
          }
          console.log('----- session', session)
          if (!session) {
            newSession(secret, request, cookieOpts, done)
            return
          }
          if (session && session.expires && session.expires <= Date.now()) {
            console.log('----- session expired')
            options.store.destroy(sessionId, getDestroyCallback(secret, request, reply, done, cookieOpts))
            return
          }
          request.session = new Session(
            cookieOpts,
            secret,
            session
          )
          console.log('----- new session', request.session)
          done()
        })
      }
    }
  }
}

function onSend (options) {
  return function saveSession (request, reply, payload, done) {
    const session = request.session
    const tmp = shouldSaveSession(request, options.cookie, options.saveUninitialized)
    console.log('----- shouldSaveSession', tmp, session)
    if (!session || !session.sessionId || !tmp) {
      done()
      return
    }
    options.store.set(session.sessionId, session, (err) => {
      console.log('----- updated store, err:', err)
      if (err) {
        done(err)
        return
      }
      console.log('----- updated store', session)
      reply.setCookie(options.cookieName, session.encryptedSessionId, session.cookie)
      console.log('----- set the cookie', options.cookieName)
      done()
    })
  }
}

function getDestroyCallback (secret, request, reply, done, cookieOpts) {
  return function destroyCallback (err) {
    if (err) {
      done(err)
      return
    }
    newSession(secret, request, cookieOpts, done)
  }
}

function newSession (secret, request, cookieOpts, done) {
  request.session = new Session(cookieOpts, secret)
  done()
}

function checkOptions (options) {
  if (!options.secret) {
    return new Error('the secret option is required!')
  }
  if (options.secret.length < 32) {
    return new Error('the secret must have length 32 or greater')
  }
}

function ensureDefaults (options) {
  options.store = options.store || new Store()
  options.cookieName = options.cookieName || 'sessionId'
  options.cookie = options.cookie || {}
  options.cookie.secure = option(options.cookie, 'secure', true)
  options.saveUninitialized = option(options, 'saveUninitialized', true)
  return options
}

function shouldSaveSession (request, cookieOpts, saveUninitialized) {
  console.log('----- saveUninitialized', saveUninitialized)
  console.log('----- isSessionModified', isSessionModified(request.session))
  if (!saveUninitialized && !isSessionModified(request.session)) {
    return false
  }
  console.log('----- secure', cookieOpts.secure)
  if (cookieOpts.secure !== true) {
    return true
  }
  const connection = request.req.connection
  console.log('----- connection', connection.encrypted === true, JSON.stringify(connection))
  if (connection && connection.encrypted === true) {
    return true
  }
  const forwardedProto = request.headers['x-forwarded-proto']
  console.log('----- forwardedProto', forwardedProto)
  return forwardedProto === 'https'
}

function isSessionModified (session) {
  return (Object.keys(session).length !== 4)
}

function option (options, key, def) {
  return options[key] === undefined ? def : options[key]
}

exports = module.exports = fastifyPlugin(session, metadata)
module.exports.Store = Store
