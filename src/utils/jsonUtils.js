function parse(str) {
  return JSON.parse(str);
}

function stringify(obj) {
  return JSON.stringify(obj, null, 2);
}

module.exports = { parse, stringify };
