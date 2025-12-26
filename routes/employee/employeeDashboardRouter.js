const express = require('express');
const Router = express.Router();

const {
  getEmployeeDashboard
} = require('../../controller/employee/employeeDashboardController');

Router.get('/employee-dashboard', getEmployeeDashboard);

module.exports = Router;
