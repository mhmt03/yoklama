const tslib = require('tslib');

const compat = {
  ...tslib,
  default: tslib,
  __esModule: true,
};
compat.default = compat;

module.exports = compat;
