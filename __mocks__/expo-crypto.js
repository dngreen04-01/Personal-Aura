const CryptoDigestAlgorithm = {
  SHA256: 'SHA-256',
};

const getRandomValues = jest.fn((array) => {
  for (let i = 0; i < array.length; i++) {
    array[i] = Math.floor(Math.random() * 256);
  }
  return array;
});

const digestStringAsync = jest.fn().mockResolvedValue('mock-hashed-nonce-value');

module.exports = { CryptoDigestAlgorithm, getRandomValues, digestStringAsync };
