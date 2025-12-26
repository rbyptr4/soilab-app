const asyncHandler = require('express-async-handler');
const jwt = require('jsonwebtoken');
const Employee = require('../../model/employeeModel');

const validateToken = asyncHandler(async (req, res, next) => {
  const bearer = req.headers.authorization;
  const token =
    req.cookies?.accessToken ||
    (bearer && bearer.startsWith('Bearer ') ? bearer.split(' ')[1] : null);

  if (!token) {
    return res.status(401).json({
      success: false,
      title: 'Unauthorized',
      message: 'Token tidak ditemukan'
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

    req.user = {
      id: decoded.sub,
      role: decoded.role,
      name: decoded.name
    };

    if (decoded.role === 'karyawan') {
      const employee = await Employee.findOne({ user: decoded.sub })
        .select('pages')
        .lean();

      if (employee) {
        req.user.pages = employee.pages || [];
      } else {
        req.user.pages = [];
      }
    }

    return next();
  } catch (e) {
    console.log('[validateToken] JWT ERROR', e?.message);

    return res.status(401).json({
      success: false,
      title: 'Unauthorized',
      message: 'Token tidak valid atau expired'
    });
  }
});

module.exports = validateToken;
