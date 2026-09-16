<template>
  <div>
    <div class="page-heading">
      <div>
        <el-button text @click="router.push('/ordersList')">← 返回预约列表</el-button>
        <h1>体检报告</h1>
        <p class="muted">按检查项目分组录入结果，完成后填写总检结论并归档。</p>
      </div>
      <div class="page-heading-actions">
        <el-button :loading="loading" :disabled="saving" @click="refresh">刷新数据</el-button>
        <el-tag v-if="order" :type="archived ? 'success' : 'warning'">
          {{ archived ? '已归档 · 只读' : '未归档 · 可编辑' }}
        </el-tag>
      </div>
    </div>

    <el-alert v-if="error" :title="error" type="error" :closable="false" class="spaced" />

    <div v-loading="loading" class="report-body">
      <template v-if="order && report">
        <section class="surface patient-summary">
          <div>
            <span class="avatar large">{{ order.users.realName.slice(0, 1) }}</span>
            <h2>{{ order.users.realName }}</h2>
            <p>{{ order.users.sex === 1 ? '男' : '女' }} · {{ order.userId }}</p>
          </div>
          <dl>
            <dt>预约编号</dt><dd>{{ order.orderId }}</dd>
            <dt>体检日期</dt><dd>{{ order.orderDate }}</dd>
            <dt>体检机构</dt><dd>{{ order.hospital.name }}</dd>
            <dt>体检套餐</dt><dd>{{ order.setmeal.name }}</dd>
          </dl>
        </section>

        <section class="surface spaced">
          <div class="section-heading">
            <div>
              <h2>检查结果</h2>
              <p class="muted">可按组逐步保存；数值项目自动判断范围，文字项目由医生选择状态。</p>
            </div>
            <el-button
              v-if="!archived && items.length"
              type="primary"
              :loading="saving"
              :disabled="!validItems || !dirty"
              @click="saveAllItems"
            >
              保存全部检查结果
            </el-button>
          </div>

          <el-collapse v-if="groups.length" v-model="activeGroups" class="report-groups">
            <el-collapse-item v-for="group in groups" :key="group.key" :name="group.key">
              <template #title>
                <div class="report-group-title">
                  <strong>{{ group.name }}</strong>
                  <span class="muted">{{ group.items.length }} 项</span>
                  <el-tag size="small" :type="groupStatus(group).type">
                    {{ groupStatus(group).text }}
                  </el-tag>
                </div>
              </template>

              <el-table :data="group.items" empty-text="本组暂无检查明细">
                <el-table-column prop="name" label="检查指标" min-width="140" />
                <el-table-column label="结果" min-width="230">
                  <template #default="{ row }">
                    <strong v-if="archived" class="result-text">{{ row.value || '—' }}</strong>
                    <el-input
                      v-else-if="numericItem(row)"
                      v-model="row.value"
                      :aria-label="row.name + '结果'"
                      placeholder="输入数值"
                      :disabled="saving"
                    />
                    <el-input
                      v-else
                      v-model="row.value"
                      type="textarea"
                      :autosize="{ minRows: 2, maxRows: 5 }"
                      :aria-label="row.name + '结果'"
                      placeholder="填写检查所见"
                      :disabled="saving"
                    />
                  </template>
                </el-table-column>
                <el-table-column label="单位" min-width="100">
                  <template #default="{ row }">{{ row.unit || '—' }}</template>
                </el-table-column>
                <el-table-column label="参考范围" min-width="160">
                  <template #default="{ row }">{{ rangeText(row) }}</template>
                </el-table-column>
                <el-table-column label="状态" width="140">
                  <template #default="{ row }">
                    <el-select
                      v-if="!archived && !numericItem(row)"
                      v-model="row.isError"
                      :aria-label="row.name + '异常状态'"
                      :disabled="saving"
                      placeholder="医生判断"
                    >
                      <el-option label="无异常标记" :value="0" />
                      <el-option label="异常" :value="1" />
                    </el-select>
                    <el-tag v-else-if="validValue(row)" :type="abnormal(row) ? 'danger' : 'success'">
                      {{ abnormal(row) ? '异常' : '无异常标记' }}
                    </el-tag>
                    <span v-else class="muted">待填写</span>
                  </template>
                </el-table-column>
              </el-table>

              <div v-if="!archived" class="report-group-actions">
                <span class="muted">
                  {{ groupValid(group) ? (groupDirty(group) ? '本组有未保存内容' : '本组已与服务端同步') : '请先填写本组全部结果' }}
                </span>
                <el-button
                  type="primary"
                  plain
                  :loading="savingGroup === group.key"
                  :disabled="saving || !groupValid(group) || !groupDirty(group)"
                  @click="saveGroup(group)"
                >
                  保存“{{ group.name }}”
                </el-button>
              </div>
            </el-collapse-item>
          </el-collapse>

          <div v-else class="report-template-empty">
            <el-alert
              :title="archived ? '该已归档预约没有检查明细。' : '该预约尚未生成检查项目。'"
              type="warning"
              :closable="false"
            />
            <div v-if="!archived">
              <p class="muted">点击后，系统会按本次预约选择的体检套餐生成检查项目和明细。</p>
              <el-button type="primary" :loading="initializing" :disabled="saving" @click="initializeReport">
                生成检查项目
              </el-button>
            </div>
          </div>

          <p v-if="!archived && items.length" class="muted spaced">
            {{ dirty ? '仍有未保存的检查结果，请保存后再归档。' : '检查结果已与服务端同步。' }}
          </p>
        </section>

        <section class="surface spaced">
          <div class="section-heading">
            <div>
              <h2>总检结论</h2>
              <p class="muted">每条结论分别保存。</p>
            </div>
            <el-button v-if="!archived" :disabled="saving" @click="editConclusion()">新增结论</el-button>
          </div>
          <el-empty v-if="!report.conclusions.length" description="尚未填写总检结论" :image-size="70" />
          <article v-for="conclusion in report.conclusions" :key="conclusion.orId" class="conclusion">
            <div>
              <h3>{{ conclusion.title }}</h3>
              <p>{{ conclusion.content }}</p>
            </div>
            <div v-if="!archived" class="conclusion-actions">
              <el-button size="small" :disabled="saving" @click="editConclusion(conclusion)">编辑</el-button>
              <el-button size="small" type="danger" plain :disabled="saving" @click="removeConclusion(conclusion)">
                删除
              </el-button>
            </div>
          </article>
        </section>

        <section v-if="!archived" class="archive-panel">
          <div>
            <h2>完成报告归档</h2>
            <p>归档前必须保存全部检查结果并填写至少一条总检结论；归档后报告只读。</p>
          </div>
          <el-button
            type="primary"
            :loading="saving"
            :disabled="dirty || !validItems || !report.conclusions.length"
            @click="archive"
          >
            确认归档
          </el-button>
        </section>
      </template>
      <el-empty v-else-if="!loading && !error" description="报告不存在" />
    </div>

    <el-dialog
      v-model="dialog"
      :title="form.orId ? '编辑总检结论' : '新增总检结论'"
      width="min(560px, 92vw)"
      :close-on-click-modal="false"
    >
      <form @submit.prevent="saveConclusion">
        <label>
          结论标题
          <el-input v-model="form.title" maxlength="100" placeholder="请输入结论标题" />
        </label>
        <label class="spaced block">
          结论内容
          <el-input
            v-model="form.content"
            type="textarea"
            :rows="5"
            maxlength="2000"
            show-word-limit
            placeholder="填写课堂演示结论"
          />
        </label>
        <el-alert v-if="dialogError" :title="dialogError" type="error" :closable="false" class="spaced" />
        <div class="dialog-actions">
          <el-button :disabled="saving || (!form.title && !form.content)" @click="clearConclusion">清空输入</el-button>
          <el-button :disabled="saving" @click="dialog = false">取消</el-button>
          <el-button type="primary" native-type="submit" :loading="saving">保存结论</el-button>
        </div>
      </form>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, reactive, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import { ElMessage } from 'element-plus'
import { api } from '../api'

const route = useRoute()
const router = useRouter()
const order = ref(null)
const report = ref(null)
const items = ref([])
const savedState = ref({})
const activeGroups = ref([])
const error = ref('')
const loading = ref(false)
const saving = ref(false)
const savingGroup = ref('')
const initializing = ref(false)
const dialog = ref(false)
const dialogError = ref('')
const form = reactive({ orId: null, title: '', content: '' })

const archived = computed(() => order.value && order.value.state === 2)
const numeric = value => value !== null && value !== undefined && String(value).trim() !== '' && Number.isFinite(Number(value))
const numericItem = item => Number(item.type) === 1 || (item.type == null && (numeric(item.minrange) || numeric(item.maxrange)))
const validValue = item => numericItem(item) ? numeric(item.value) : item.value != null && String(item.value).trim() !== ''
const abnormal = item => numericItem(item)
  ? ((numeric(item.minrange) && Number(item.value) < Number(item.minrange)) ||
    (numeric(item.maxrange) && Number(item.value) > Number(item.maxrange)))
  : Number(item.isError) === 1

function snapshot(item) {
  return JSON.stringify([item.value == null ? '' : String(item.value), Number(item.isError)])
}

const dirty = computed(() => items.value.some(item => savedState.value[item.cidrId] !== snapshot(item)))
const validItems = computed(() => items.value.length > 0 && items.value.every(item =>
  validValue(item) && (numericItem(item) || item.isError === 0 || item.isError === 1)
))

function itemGroupKey(item) {
  return String(item.reportGroupId == null ? (item.checkItemId == null ? item.ciId : item.checkItemId) : item.reportGroupId)
}

const groups = computed(() => {
  const result = new Map()
  for (const item of items.value) {
    const key = itemGroupKey(item)
    if (!result.has(key)) result.set(key, { key, name: item.ciName || '其他检查', items: [] })
    result.get(key).items.push(item)
  }
  return [...result.values()]
})

function groupValid(group) {
  return group.items.length > 0 && group.items.every(item =>
    validValue(item) && (numericItem(item) || item.isError === 0 || item.isError === 1)
  )
}

function groupDirty(group) {
  return group.items.some(item => savedState.value[item.cidrId] !== snapshot(item))
}

function groupStatus(group) {
  if (groupDirty(group)) return { type: 'warning', text: '未保存' }
  if (groupValid(group)) return { type: 'success', text: '已保存' }
  return { type: 'info', text: '待填写' }
}

function rangeText(item) {
  if (numericItem(item)) {
    if (numeric(item.minrange) && numeric(item.maxrange)) return item.minrange + '–' + item.maxrange
    if (numeric(item.minrange)) return '≥ ' + item.minrange
    if (numeric(item.maxrange)) return '≤ ' + item.maxrange
  }
  return item.normalValueString || item.normalValue || '医生根据检查所见判断'
}

function setSavedBaseline(rows) {
  savedState.value = Object.fromEntries(rows.map(item => [item.cidrId, snapshot(item)]))
}

function apply(serverReport) {
  report.value = serverReport
  items.value = serverReport.items.map(item => ({ ...item }))
  setSavedBaseline(items.value)
  activeGroups.value = [...new Set(items.value.map(itemGroupKey))]
}

let generation = 0
async function load() {
  const current = ++generation
  loading.value = true
  error.value = ''
  try {
    const [appointment, serverReport] = await Promise.all([
      api.order(route.query.orderId),
      api.report(route.query.orderId)
    ])
    if (current === generation) {
      order.value = appointment
      apply(serverReport)
    }
  } catch (caught) {
    if (current === generation) error.value = caught.message
  } finally {
    if (current === generation) loading.value = false
  }
}

async function refresh() {
  if (dirty.value && !archived.value && !window.confirm('刷新会丢弃尚未保存的检查结果，确认刷新？')) return
  await load()
}

function writePayload(rows) {
  return rows.map(item => ({ ...item, isError: abnormal(item) ? 1 : 0 }))
}

async function saveAllItems() {
  saving.value = true
  error.value = ''
  try {
    apply(await api.saveReport(order.value.orderId, writePayload(items.value)))
    ElMessage.success('全部检查结果已保存')
  } catch (caught) {
    error.value = caught.message
  } finally {
    saving.value = false
  }
}

async function saveGroup(group) {
  saving.value = true
  savingGroup.value = group.key
  error.value = ''
  const savedIds = new Set(group.items.map(item => String(item.cidrId)))
  try {
    const serverReport = await api.saveReport(order.value.orderId, writePayload(group.items))
    const serverById = new Map(serverReport.items.map(item => [String(item.cidrId), item]))
    items.value = items.value.map(item => savedIds.has(String(item.cidrId))
      ? { ...(serverById.get(String(item.cidrId)) || item) }
      : item
    )
    report.value = { ...serverReport, items: items.value }
    const nextBaseline = { ...savedState.value }
    for (const item of items.value) {
      if (savedIds.has(String(item.cidrId))) nextBaseline[item.cidrId] = snapshot(item)
    }
    savedState.value = nextBaseline
    ElMessage.success(group.name + '已保存')
  } catch (caught) {
    error.value = caught.message
  } finally {
    saving.value = false
    savingGroup.value = ''
  }
}

async function initializeReport() {
  initializing.value = true
  saving.value = true
  error.value = ''
  try {
    apply(await api.initializeReport(order.value.orderId))
    ElMessage.success('检查项目已按套餐生成')
  } catch (caught) {
    error.value = caught.message
  } finally {
    initializing.value = false
    saving.value = false
  }
}

function editConclusion(conclusion) {
  Object.assign(form, {
    orId: conclusion ? conclusion.orId : null,
    title: conclusion ? conclusion.title : '',
    content: conclusion ? conclusion.content : ''
  })
  dialogError.value = ''
  dialog.value = true
}

function clearConclusion() {
  form.title = ''
  form.content = ''
  dialogError.value = ''
}

async function saveConclusion() {
  if (!form.title.trim() || !form.content.trim()) {
    dialogError.value = '请填写标题和内容'
    return
  }
  saving.value = true
  try {
    const result = await api.saveConclusion(order.value.orderId, { ...form })
    report.value = { ...report.value, conclusions: result.conclusions }
    dialog.value = false
    ElMessage.success('结论已保存')
  } catch (caught) {
    dialogError.value = caught.message
  } finally {
    saving.value = false
  }
}

async function removeConclusion(conclusion) {
  if (!window.confirm('确认删除这条总检结论？')) return
  saving.value = true
  error.value = ''
  try {
    const result = await api.removeConclusion(order.value.orderId, conclusion.orId)
    report.value = { ...report.value, conclusions: result.conclusions }
    ElMessage.success('结论已删除')
  } catch (caught) {
    error.value = caught.message
  } finally {
    saving.value = false
  }
}

async function archive() {
  if (!window.confirm('归档后本版本将只读，确认归档？')) return
  saving.value = true
  error.value = ''
  try {
    order.value = await api.archiveOrder(order.value.orderId)
    report.value.state = 2
    ElMessage.success('报告已归档并保存到后端')
  } catch (caught) {
    error.value = caught.message
  } finally {
    saving.value = false
  }
}

function beforeUnload(event) {
  if (dirty.value && !archived.value) {
    event.preventDefault()
    event.returnValue = ''
  }
}

onBeforeRouteLeave(() => !dirty.value || archived.value || window.confirm('检查结果尚未保存，确认离开？'))
onMounted(() => {
  load()
  window.addEventListener('beforeunload', beforeUnload)
})
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))
watch(() => route.query.orderId, () => load())
</script>
