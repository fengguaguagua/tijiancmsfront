<template>
  <router-view v-if="route.meta.public" />
  <div v-else class="workspace">
    <aside class="sidebar">
      <router-link to="/ordersList" class="brand"><span class="brand-symbol" aria-hidden="true">+</span><span><strong>熙心健康</strong><small>医生工作台</small></span></router-link>
      <div class="sidebar-label">诊疗工作</div>
      <nav aria-label="主导航"><router-link to="/ordersList" class="nav-item active"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="16" rx="3"/><path d="M8 3v4m8-4v4M4 11h16m-11 4h2m2 0h2m-6 3h2"/></svg>预约与报告</router-link></nav>
      <div class="sidebar-note"><span class="small-cross" aria-hidden="true">+</span><strong>让健康服务更清晰</strong><p>查询预约 · 记录检查<br>审核结论 · 报告归档</p></div>
      <div class="sidebar-bottom">东软熙心健康<br><span>体检管理教学项目</span></div>
    </aside>
    <div class="workspace-main">
      <header class="topbar">
        <div class="breadcrumb">医生工作台 <span>/</span> <strong>{{ route.path === '/ordersContent' ? '体检报告' : '预约管理' }}</strong></div>
        <div class="topbar-right">
          <span class="mode-badge" :class="{ live: !isMock }"><i></i>{{ isMock ? '课堂演示 · 模拟数据' : backendLabel }}</span>
          <div class="doctor-profile"><span class="avatar">{{ (doctor.realName || '医').slice(0, 1) }}</span><span>{{ doctor.realName || doctor.docCode || '医生' }}<small>医生</small></span></div>
          <el-button class="logout-button" @click="logout">退出</el-button>
        </div>
      </header>
      <main class="page-content"><router-view /></main>
      <footer class="workspace-footer">{{ isMock ? '当前为课堂模拟环境，数据用于学习与演示，不用于临床诊疗。' : '请使用已授权的测试数据，并核对服务端返回结果。' }}</footer>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { isMock } from './api'

const backendLabel = process.env.VUE_APP_ENV_LABEL || '后端服务 · 联机模式'
const route = useRoute()
const router = useRouter()
const doctor = computed(() => {
  const currentPath = route.fullPath
  if (!currentPath) return {}
  try { return JSON.parse(sessionStorage.getItem('doctor') || '{}') || {} } catch (_) { return {} }
})
async function logout() {
  await router.push('/login')
  // 如果报告页取消离开确认，保留会话和未保存内容。
  if (router.currentRoute.value.meta.public) {
    sessionStorage.removeItem('doctor')
    sessionStorage.removeItem('tijian_doctor_token')
  }
}
</script>
