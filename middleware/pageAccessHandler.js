const Employee = require('../model/employeeModel');
const asyncHandler = require('express-async-handler');
const throwError = require('../utils/throwError');

const checkEmployeePageAccess = (page) =>
  asyncHandler(async (req, res, next) => {
    if (req.user.role !== 'karyawan') return next();

    if (!req.user.pages?.includes(page)) {
      throwError('Anda tidak memiliki akses ke halaman ini', 403);
    }

    next();
  });

module.exports = checkEmployeePageAccess;

module.exports = { checkEmployeePageAccess };
