const asyncHandler = require('express-async-handler');
const throwError = require('../../utils/throwError');

const Loan = require('../../model/loanModel');
const ReturnLoan = require('../../model/returnLoanModel');
const ProgressProject = require('../../model/progressProjectModel');
const ExpenseRequest = require('../../model/expenseRequestModel');
const PvReport = require('../../model/pvReportModel');

const getEmployeeDashboard = asyncHandler(async (req, res) => {
  if (req.user.role !== 'karyawan') {
    throwError('Akses ditolak', 403);
  }

  const me = await Employee.findOne({ user: req.user.id }).select('_id').lean();

  if (!me) {
    throwError('Karyawan tidak ditemukan', 404);
  }

  const [
    progressProjectsCount, // global
    expenseRequestsCount, // milik employee
    pvReportsCount, // milik employee
    loansCount, // milik employee
    returnLoansCount // milik employee
  ] = await Promise.all([
    ProgressProject.countDocuments(),

    ExpenseRequest.countDocuments({
      created_by: me._id
    }),

    PvReport.countDocuments({
      created_by: me._id
    }),

    Loan.countDocuments({
      borrower: me._id
    }),

    ReturnLoan.countDocuments({
      borrower: me._id
    })
  ]);

  res.status(200).json({
    projects: progressProjectsCount,
    expense_requests: expenseRequestsCount,
    pv_reports: pvReportsCount,
    loans: loansCount,
    return_loans: returnLoansCount
  });
});

module.exports = { getEmployeeDashboard };
