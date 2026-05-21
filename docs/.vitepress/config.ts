import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Display order for doc files
const FILE_ORDER = ['翻译', '总结', 'Demo']
const FILE_ICONS: Record<string, string> = {
  '翻译': '📖',
  '总结': '📋',
  'Demo': '💻'
}

// Auto-generate sidebar from directory structure
function generateSidebar(basePath: string) {
  const fullBase = path.join(__dirname, '..', basePath)

  if (!fs.existsSync(fullBase)) return []

  const categories = fs.readdirSync(fullBase, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .filter(d => !d.name.startsWith('.'))
    .sort((a, b) => a.name.localeCompare(b.name))

  return categories.map(cat => {
    const catPath = path.join(fullBase, cat.name)
    const docs = fs.readdirSync(catPath, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name))

    const items = docs.map(doc => {
      const docDir = path.join(catPath, doc.name)
      const files = fs.readdirSync(docDir)
        .filter(f => f.endsWith('.md'))
        .map(f => f.replace('.md', ''))

      // Clean up the name: remove date prefix
      const cleanName = doc.name.replace(/^\d{2}月\d{2}日\d{2}时\d{2}分-/, '')

      // Sort files by defined order
      const sortedFiles = [...files].sort((a, b) => {
        const ia = FILE_ORDER.indexOf(a)
        const ib = FILE_ORDER.indexOf(b)
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
      })

      // Create sub-items for each file
      const subItems = sortedFiles.map(fileName => ({
        text: `${FILE_ICONS[fileName] || '📄'} ${fileName}`,
        link: `/${basePath}/${cat.name}/${doc.name}/${fileName}`
      }))

      // If only one file, link directly; otherwise use collapsible group
      if (subItems.length === 1) {
        return subItems[0]
      }

      return {
        text: cleanName,
        collapsed: true,
        items: subItems
      }
    })

    return {
      text: cat.name,
      collapsed: false,
      items
    }
  })
}

export default withMermaid(defineConfig({
  base: '/langchain-docs/',
  title: 'LangChain 技术文档',
  description: 'LangChain / LangGraph / DeepAgent 官方文档中文走读',

  head: [
    ['link', { rel: 'icon', href: '/langchain-docs/favicon.ico' }]
  ],

  themeConfig: {
    nav: [
      { text: '首页', link: '/' },
      { text: 'LangChain', link: '/langchain/' },
      { text: 'LangGraph', link: '/langgraph/' },
      { text: 'DeepAgent', link: '/deepagent/' }
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
      provider: 'local'
    },

    outline: {
      level: [2, 3],
      label: '页面导航'
    },

    docFooter: {
      prev: '上一篇',
      next: '下一篇'
    }
  },

  mermaid: {
    theme: 'default'
  },

  cleanUrls: true,
  lastUpdated: true,

  markdown: {
    anchor: { permalink: false }
  },

  ignoreDeadLinks: true
}))
