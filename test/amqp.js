const SandboxedModule = require('sandboxed-module');
const expect = require('chai').expect;
require('chai').use(require('chai-as-promised'));
require('chai').use(require('dirty-chai'));
const AMQP = require('../amqp');
const config = require('./config');

describe('AMQP', function () {
  describe('#constructor', function () {
    it('should throw with empty constructor', function () {
      expect(function () { AMQP(); }).to.throw('amqp-wrapper: Invalid config');
    });
    it('should throw with no url or exchange', function () {
      expect(function () { AMQP({}); }).to.throw('amqp-wrapper: Invalid config');
    });
    it('should throw with no url', function () {
      expect(function () { AMQP({ exchange: '' }); }).to.throw('amqp-wrapper: Invalid config');
    });
    it('should throw with no exchange', function () {
      expect(function () { AMQP({ url: '' }); }).to.throw('amqp-wrapper: Invalid config');
    });
  });
  describe('#connect', function () {
    it('should should fail to connect to bad endpoint', function (done) {
      var amqp = AMQP({
        url: 'amqp://guest:guest@localhost:6767',
        exchange: 'FOO'
      });
      amqp.connect().catch(function (err) {
        expect(err.code).to.equal('ECONNREFUSED');
        done();
      });
    });
    it('should call the callback successfully', function (done) {
      var amqp = AMQP(config.good);
      amqp.connect().then(() => done());
    });
    it('should declare your queue, and bind it', async function () {
      var amqpLibMock = require('./amqplibmock')();
      var mockedAMQP = SandboxedModule.require('../amqp', {
        requires: {
          'amqplib': amqpLibMock.mock
        }
      })(config.good);

      await mockedAMQP.connect();
      // one queue, dead lettered
      expect(amqpLibMock.assertQueueSpy.callCount).to.equal(2);
      // Bind the consume queue, and its dead letter queue.
      expect(amqpLibMock.bindQueueSpy.callCount).to.equal(2);
    });
    it('allows you to specify an array for routingKey and binds each given', function (done) {
      var amqpLibMock = require('./amqplibmock')();
      var mockedAMQP = SandboxedModule.require('../amqp', {
        requires: {
          'amqplib': amqpLibMock.mock
        }
      })(config.routingKeyArray);

      mockedAMQP.connect().then(function () {
        // one queue, dead lettered
        expect(amqpLibMock.assertQueueSpy.callCount).to.equal(2);
        // Bind the consume queue with its two routing keys, and its dead
        // letter queue.
        expect(amqpLibMock.bindQueueSpy.callCount).to.equal(4);
        done();
      }).catch(done);
    });
    it('should just declare if you don\'t specify routing key', function (done) {
      var amqpLibMock = require('./amqplibmock')();
      var mockedAMQP = SandboxedModule.require('../amqp', {
        requires: {
          'amqplib': amqpLibMock.mock
        }
      })(config.noRoutingKey);

      mockedAMQP.connect().then(function () {
        // one queue, not dead lettered
        expect(amqpLibMock.assertQueueSpy.callCount).to.equal(1);
        // No binding.
        expect(amqpLibMock.bindQueueSpy.callCount).to.equal(0);
        done();
      }).catch(done);
    });
  });
  describe('#publish', function () {
    it('should resolve successfully', async function () {
      var amqp = AMQP(config.good);
      await amqp.connect();
      await expect(amqp.publish('myqueue', 'test', {})).to.eventually.be.fulfilled();
    });
    it('should accept objects', async function () {
      var amqp = AMQP(config.good);
      await amqp.connect();
      await expect(amqp.publish('myqueue', { woo: 'test' }, {})).to.eventually.be.fulfilled();
    });
  });
  describe('#consume', async function () {
    it('if done(err) is called with err === null, calls ack().', function (done) {
      var ack = function () {
        done();
      };

      var amqpLibMock = require('./amqplibmock')({ overrides: { ack: ack } });
      var mockedAMQP = SandboxedModule.require('../amqp', {
        requires: {
          'amqplib': amqpLibMock.mock
        }
      })(config.good);

      function myMessageHandler (parsedMsg, cb) {
        cb();
      }

      mockedAMQP.connect().then(function () {
        mockedAMQP.consume(myMessageHandler);
      }).catch(done);
    });

    it('if json unparsable, calls nack() with requeue of false.', function (done) {
      var nack = function (message, upTo, requeue) {
        expect(requeue).to.equal(false);
        done();
      };

      var amqpLibMock = require('./amqplibmock')({
        messageToDeliver: 'nonvalidjson',
        overrides: { nack: nack }
      });

      var mockedAMQP = SandboxedModule.require('../amqp', {
        requires: {
          'amqplib': amqpLibMock.mock
        }
      })(config.good);

      function myMessageHandler (parsedMsg, cb) {
        cb();
      }

      mockedAMQP.connect().then(function () {
        mockedAMQP.consume(myMessageHandler);
      }).catch(done);
    });
    it('if json callback called with err, calls nack() with requeue as given.',
      function (done) {
        var nack = function (message, upTo, requeue) {
          expect(requeue).to.equal('requeue');
          done();
        };

        var amqpLibMock = require('./amqplibmock')({ overrides: { nack: nack } });

        var mockedAMQP = SandboxedModule.require('../amqp', {
          requires: {
            'amqplib': amqpLibMock.mock
          }
        })(config.good);

        function myMessageHandler (parsedMsg, cb) {
          cb(new Error('got it bad'), 'requeue');
        }

        mockedAMQP.connect().then(function () {
          mockedAMQP.consume(myMessageHandler);
        }).catch(done);
      });
  });
});

// vim: set et sw=2 colorcolumn=80:
