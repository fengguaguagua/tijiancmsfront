// 将组员的 Spring Boot 接口转换为页面使用的数据结构。
// 此文件不发起网络请求；request 由 api.js 注入，便于独立验证接口约定。
export function formatOrderDate(value) {
  if (!value) return ''
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date)
  const part = type => parts.find(item => item.type === type).value
  return `${part('year')}-${part('month')}-${part('day')}`
}

function withoutPassword(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const safe = {...value}
  delete safe.password
  delete safe._token
  return safe
}

function normalizeOrder(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('预约不存在或后端返回格式不正确')
  return {
    ...value,
    orderDate: formatOrderDate(value.orderDate),
    users: withoutPassword(value.users) || {realName: '用户资料待补充', sex: null},
    hospital: value.hospital || {name: '医院资料待补充'},
    setmeal: value.setmeal || {name: '套餐资料待补充'}
  }
}

function requireArray(value, name) {
  if (!Array.isArray(value)) throw new Error(`${name}返回格式不正确，应为数组`)
  return value
}

function requireCount(value, name, expected = 1) {
  if (!Number.isInteger(value) || value !== expected) {
    throw new Error(`${name}未完成：后端返回影响行数 ${String(value)}，预期 ${expected}。请刷新确认数据后重试。`)
  }
}

function requireNonNegativeCount(value, name) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name}未完成：后端返回格式不正确。请刷新确认数据后重试。`)
  }
}

function positiveInteger(value, fallback) {
  const n = Number(value)
  return Number.isInteger(n) && n > 0 ? n : fallback
}

export function createDoctorBackend(request) {
  const order = async orderId => normalizeOrder(await request('orders/getOrdersById', {orderId}))
  const conclusions = async orderId => requireArray(
    await request('overallResult/listOverallResultByOrderId', {orderId}), '总检结论'
  ).filter(item => String(item.orderId) === String(orderId))

  async function report(orderId) {
    const [groups, result, appointment] = await Promise.all([
      request('ciReport/listCiReport', {orderId}), conclusions(orderId), order(orderId)
    ])
    // 旧实现只按 ciId 查询，必须继续按预约过滤，防止混入其他人的明细。
    const matchingGroups = requireArray(groups, '检查项目').filter(group => String(group.orderId) === String(orderId))
    // cidetailedreport.ciId 在正式表结构中指向 cireport.cirId，而不是 checkitem.ciId。
    // 对早期课堂测试库保留一次 ciId 回退，便于旧数据升级前仍可读取。
    const groupKey = group => String(group.cirId == null ? `legacy-${group.ciId}` : group.cirId)
    const uniqueGroups = [...new Map(matchingGroups.map(group => [groupKey(group), group])).values()]
    const batches = await Promise.all(uniqueGroups.map(async group => {
      const primaryId = group.cirId == null ? group.ciId : group.cirId
      let details = requireArray(await request('ciDetailedReport/listCiDetailedReportByCiId', {
        ciId: primaryId, orderId
      }), '检查明细').filter(detail =>
        String(detail.orderId) === String(orderId) && String(detail.ciId) === String(primaryId)
      )
      if (!details.length && group.cirId != null && String(group.cirId) !== String(group.ciId)) {
        details = requireArray(await request('ciDetailedReport/listCiDetailedReportByCiId', {
          ciId: group.ciId, orderId
        }), '检查明细').filter(detail =>
          String(detail.orderId) === String(orderId) && String(detail.ciId) === String(group.ciId)
        )
      }
      return details.map(detail => ({
        ...detail,
        reportGroupId: group.cirId == null ? null : group.cirId,
        checkItemId: group.ciId,
        ciName: group.ciName,
        value: detail.value == null ? '' : String(detail.value)
      }))
    }))
    const items = [...new Map(batches.flat().map(item => [String(item.cidrId), item])).values()]
    return {orderId: appointment.orderId, state: appointment.state, items, conclusions: result}
  }

  return {
    async doctorLogin(data) {
      const doctor = withoutPassword(await request('doctor/getDoctorByCodeByPass', data))
      if (!doctor || !positiveInteger(doctor.docId, 0)) throw new Error('医生编码或密码不正确')
      return doctor
    },
    async setmeals() {
      return requireArray(await request('setmeal/listSetmeal', {}), '体检套餐')
    },
    async adminOrders(data = {}) {
      const pageNum = positiveInteger(data.pageNum, 1)
      const maxPageNum = positiveInteger(data.maxPageNum, 8)
      const payload = {pageNum, maxPageNum, beginNum: (pageNum - 1) * maxPageNum}
      for (const key of ['userId', 'realName', 'orderDate']) {
        if (data[key] != null && String(data[key]).trim() !== '') payload[key] = String(data[key]).trim()
      }
      for (const key of ['sex', 'smId', 'state']) {
        if (data[key] == null || String(data[key]).trim() === '') continue
        const number = Number(data[key])
        if (!Number.isInteger(number)) throw new Error('查询条件中的编号或状态必须为整数')
        payload[key] = number
      }
      const response = await request('orders/listOrders', payload)
      if (!response || !Number.isInteger(response.total) || response.total < 0) throw new Error('预约列表返回格式不正确')
      return {...response, list: requireArray(response.list, '预约列表').map(normalizeOrder), pageNum, maxPageNum}
    },
    order,
    report,
    async initializeReport(orderId) {
      requireNonNegativeCount(await request('ciReport/createReportTemplate', {orderId}), '生成检查项目')
      const result = await report(orderId)
      if (!result.items.length) {
        throw new Error('未生成任何检查明细，请确认该预约的套餐已经配置检查项目')
      }
      return result
    },
    async saveReport(orderId, items) {
      if (!Array.isArray(items) || !items.length) throw new Error('没有可保存的检查明细')
      const payload = items.map(item => {
        if (!positiveInteger(item.cidrId, 0) || String(item.orderId) !== String(orderId)) {
          throw new Error('检查明细缺少编号或不属于当前预约，已取消保存')
        }
        if (item.value == null || String(item.value).trim() === '') throw new Error('请填写全部检查结果')
        if (item.isError !== 0 && item.isError !== 1) throw new Error('检查结果缺少明确的异常状态')
        return {cidrId: item.cidrId, ciId: item.ciId, orderId, value: String(item.value).trim(), isError: item.isError}
      })
      requireCount(await request('ciDetailedReport/updateCiDetailedReport', payload), '保存检查结果', payload.length)
      return report(orderId)
    },
    async saveConclusion(orderId, data) {
      const path = data.orId ? 'overallResult/updateOverallResult' : 'overallResult/saveOverallResult'
      requireCount(await request(path, {...data, orderId}), '保存总检结论')
      return {conclusions: await conclusions(orderId)}
    },
    async removeConclusion(orderId, orId) {
      requireCount(await request('overallResult/removeOverallResult', {orderId, orId}), '删除总检结论')
      return {conclusions: await conclusions(orderId)}
    },
    async archiveOrder(orderId) {
      requireCount(await request('orders/updateOrdersState', {orderId, state: 2}), '归档报告')
      const appointment = await order(orderId)
      if (appointment.state !== 2) throw new Error('后端未确认报告已归档，请刷新后检查')
      return appointment
    }
  }
}
