function mockScan() {
  const confidence = Number((Math.random() * 100).toFixed(2));
  return {
    confidence
  };
}

module.exports = { mockScan };
