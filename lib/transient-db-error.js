'use strict';
// Configuration, permission and SQL errors must remain visible as permanent errors.
const codes = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE',
    'PROTOCOL_CONNECTION_LOST', 'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR',
    'ER_CON_COUNT_ERROR', 'ER_SERVER_SHUTDOWN', 'ER_SERVER_ISNT_AVAILABLE']);
module.exports = error => codes.has(error?.code);
