import { defineConfig } from 'vitepress'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { withMermaid } from 'vitepress-plugin-mermaid'
const __dirname = path.dirname(fileURLToPath(import.meta.url))

const FILE_ORDER = ['翻译', '总结', 'Demo']
const FILE_ICONS = { '翻译': '📖', '总结': '📋', 'Demo': '💻' }

function generateSidebar(basePath) {
  const fullBase = path.join(__dirname, '..', basePath)
  if (!fs.existsSync(fullBase)) return []
  const categories = fs.readdirSync(fullBase, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('.'))
    .sort((a, b) => a.name.localeCompare(b.name))
  return categories.map(cat => {
    const catPath = path.join(fullBase, cat.name)
    const docs = fs.readdirSync(catPath, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name))
    const items = docs.map(doc => {
      const docDir = path.join(catPath, doc.name)
      const files = fs.readdirSync(docDir).filter(f => f.endsWith('.md')).map(f => f.replace('.md', ''))
      const cleanName = doc.name.replace(/^\d{2}月\d{2}日\d{2}时\d{2}分-/, '')
      const sortedFiles = [...files].sort((a, b) => {
        const ia = FILE_ORDER.indexOf(a)
        const ib = FILE_ORDER.indexOf(b)
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
      })
      if (sortedFiles.length <= 1) {
        return { text: cleanName, link: `/${basePath}/${cat.name}/${doc.name}/${sortedFiles[0] || ''}` }
      }
      return {
        text: cleanName,
        collapsed: true,
        items: sortedFiles.map(f => ({
          text: `${FILE_ICONS[f] || '📄'} ${f}`,
          link: `/${basePath}/${cat.name}/${doc.name}/${f}`
        }))
      }
    })
    return { text: cat.name, collapsed: false, items }
  })
}

const isVercel = !!process.env.VERCEL
const base = isVercel ? '/' : '/langchain-docs/'

export default withMermaid(defineConfig({
  base,
  title: 'LangChain 技术文档',
  description: 'LangChain / LangGraph / DeepAgent 官方文档中文走读',
  cleanUrls: false,
  lastUpdated: true,
  ignoreDeadLinks: true,
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: `${base}favicon.svg` }],
    ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }],
    ['link', { rel: 'dns-prefetch', href: 'https://fonts.googleapis.com' }],
  ],
  markdown: {
    theme: {
      light: 'github-light',
      dark: 'github-dark',
    },
  },
  themeConfig: {
    nav: [
      { text: '首页', link: '/' },
      { text: 'LangChain', link: '/langchain/' },
      { text: 'LangGraph', link: '/langgraph/' },
      { text: 'DeepAgent', link: '/deepagent/' },
      { text: '官方文档 ↗', link: 'https://docs.langchain.com/oss/python/langchain/overview' }
    ],
    sidebar: {
      '/langchain/': generateSidebar('langchain'),
      '/langgraph/': generateSidebar('langgraph'),
      '/deepagent/': generateSidebar('deepagent')
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/shuaibilx/langchain-docs' }
    ],
    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: '搜索文档', buttonAriaLabel: '搜索文档' },
          modal: {
            noResultsText: '未找到相关结果',
            resetButtonTitle: '清除搜索条件',
            displayDetails: '显示详情',
            footer: { selectText: '选择', navigateText: '切换', closeText: '关闭' }
          }
        },
        detailedView: true
      }
    },
    outline: { level: [2, 3], label: '页面导航' },
    docFooter: { prev: '上一篇', next: '下一篇' }
  }
}))
