module.exports = {
  auth: { currentUser: { getIdToken: jest.fn().mockResolvedValue('mock-token') } },
};
