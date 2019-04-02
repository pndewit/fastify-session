'use strict'

var EventEmitter = require('events').EventEmitter
var util = require('util')

function Store () {
  this.store = {}
  EventEmitter.call(this)
}

util.inherits(Store, EventEmitter)

Store.prototype.set = function set (sessionId, session, callback) {
  this.store[sessionId] = session
  console.log('----- Setting in Store:', sessionId, session)
  callback()
}

Store.prototype.get = function get (sessionId, callback) {
  const session = this.store[sessionId]
  console.log('----- Getting from Store:', sessionId, session)
  callback(null, session)
}

Store.prototype.destroy = function destroy (sessionId, callback) {
  console.log('----- Destroying Store item:', sessionId)
  this.store[sessionId] = undefined
  callback()
}

module.exports = Store
