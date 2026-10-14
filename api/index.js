'use strict';
/* /api/* rewrites use the same transaction/commit-before-response handler. */
module.exports = require('../server/index').serverlessHandler;
