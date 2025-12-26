const User = require('../../model/userModel');
const Employee = require('../../model/employeeModel');
const asyncHandler = require('express-async-handler');
const throwError = require('../../utils/throwError');

const getAllUsers = asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') {
    throwError('Anda tidak memiliki akses untuk data ini', 403);
  }

  const mode = req.query.mode || 'paging';
  const limit = Math.min(parseInt(req.query.limit) || 10, 50);
  const { email, name, phone, search, sort } = req.query;

  const filter = { role: { $nin: ['admin', 'bot'] } };
  if (email) filter.email = { $regex: email, $options: 'i' };
  if (name) filter.name = { $regex: name, $options: 'i' };
  if (phone) filter.phone = { $regex: phone, $options: 'i' };
  if (search) {
    filter.$or = [
      { email: { $regex: search, $options: 'i' } },
      { name: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } }
    ];
  }

  let sortOption = { createdAt: -1 };
  if (sort) {
    const [f, o] = sort.split(':');
    sortOption = { [f]: o === 'asc' ? 1 : -1 };
  }

  const baseQuery = User.find(filter).select('email name phone createdAt');

  if (mode === 'paging') {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const skip = (page - 1) * limit;

    const totalItems = await User.countDocuments(filter);
    const data = await baseQuery.skip(skip).limit(limit).sort(sortOption);

    return res.json({
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
      data
    });
  }

  if (mode === 'cursor') {
    if (req.query.cursor)
      filter.createdAt = { $lt: new Date(req.query.cursor) };
    const rows = await baseQuery.sort(sortOption).limit(limit + 1);

    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;

    return res.json({
      data,
      nextCursor: hasMore ? data[data.length - 1].createdAt : null,
      hasMore
    });
  }

  throwError('mode pagination tidak valid', 400);
});

const deleteUser = asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') {
    throwError('Anda tidak memiliki akses untuk menghapus user', 403);
  }

  const { id } = req.params;
  const user = await User.findById(id);

  if (!user) {
    throwError('User tidak ditemukan', 404);
  }

  await Employee.updateMany({ user: user._id }, { $set: { user: null } });
  await user.deleteOne();

  res.status(200).json({
    message: 'User berhasil dihapus dan role karyawan di hapus'
  });
});

module.exports = {
  deleteUser,
  getAllUsers
};
