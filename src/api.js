import axios from 'axios'
import {createDoctorBackend} from './doctorBackend'

// 默认课堂模拟模式。与后端联调时在 .env.local 中设置 VUE_APP_USE_MOCK=false。
export const isMock = process.env.VUE_APP_USE_MOCK !== 'false'
const role = 'doctor'
const tokenKey = 'tijian_' + role + '_token'
const client = axios.create({
  baseURL: isMock ? 'http://127.0.0.1:8090/tijiancms/' : (process.env.VUE_APP_API_BASE_URL || 'http://localhost:8088/tijiancms/'),
  timeout: 10000
})
async function request(path, data = {}) {
  try {
    const token = isMock ? sessionStorage.getItem(tokenKey) : null
    const response = await client.post(path, data, {headers: token ? {Authorization: 'Bearer ' + token} : {}})
    return response.data
  } catch (error) {
    const status = error.response && error.response.status
    if (status === 401 && !path.includes('ByPass')) {
      sessionStorage.removeItem(tokenKey)
      sessionStorage.removeItem(role === 'doctor' ? 'doctor' : 'users')
    }
    const backendMessage = error.response && error.response.data &&
      (error.response.data.message || error.response.data.detail || error.response.data.error)
    throw new Error(backendMessage || (status
      ? `接口请求失败（HTTP ${status}），请查看后端日志。`
      : (isMock ? '无法连接模拟接口。请先运行 frontend-dev/mock-server.cjs。' : '接口连接失败，请检查后端地址、服务状态和跨域配置。')))
  }
}
async function login(path, data) {
  const result = await request(path, data)
  if (!result || typeof result !== 'object') throw new Error('账号或密码不正确')
  const {_token, password, ...safe} = result
  if (_token) sessionStorage.setItem(tokenKey, _token)
  return safe
}
const mockApi = {
  login: data => login('users/getUsersByUserIdByPass', data),
  register: data => request('users/saveUsers', data),
  doctorLogin: data => login('doctor/getDoctorByCodeByPass', data),
  hospitals: () => request('hospital/listHospital'),
  hospital: hpId => request('hospital/getHospitalById', {hpId}),
  setmeals: type => request(role === 'doctor' ? 'setmeal/listSetmeal' : 'setmeal/listSetmealByType', {type}),
  setmeal: smId => request('setmeal/getSetmealById', {smId}),
  calendar: (hpId, year, month) => request('calendar/listAppointmentCalendar', {hpId, year, month}),
  orders: data => request('orders/listOrdersByUserId', data),
  order: orderId => request('orders/getOrdersById', {orderId}),
  createOrder: data => request('orders/saveOrders', data),
  cancelOrder: (orderId, userId) => request('orders/removeOrders', {orderId, userId}),
  report: (orderId, userId) => request('ciReport/listCiReport', {orderId, userId}),
  initializeReport: async orderId => {
    await request('ciReport/createReportTemplate', {orderId})
    return request('ciReport/listCiReport', {orderId})
  },
  adminOrders: data => request('orders/listOrders', data),
  saveReport: (orderId, items) => request('ciDetailedReport/updateCiDetailedReport', {orderId, items}),
  saveConclusion: (orderId, data) => request(data.orId ? 'overallResult/updateOverallResult' : 'overallResult/saveOverallResult', {orderId, ...data}),
  removeConclusion: (orderId, orId) => request('overallResult/removeOverallResult', {orderId, orId}),
  archiveOrder: orderId => request('orders/updateOrdersState', {orderId, state: 2})
}

export const api = isMock ? mockApi : createDoctorBackend(request)
