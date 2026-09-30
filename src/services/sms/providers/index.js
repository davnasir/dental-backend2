// Provider registry. Adding a gateway means dropping a module in this folder
// with a { name, isConfigured(settings), send({ to, message, settings }) } shape
// and listing it here -- no other file changes.
//
// `settings` is the resolved configuration (admin panel value, falling back to
// .env), so a driver never reads process.env itself.

import mock from './mock.js';
import generic from './generic.js';
import sslwireless from './sslwireless.js';
import mram from './mram.js';

const providers = {
  mram,
  mock,
  generic,
  sslwireless,
};

export const getSmsProvider = (name) => providers[name] || null;

export const listSmsProviders = () => Object.keys(providers);
