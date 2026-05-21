import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

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
      const files = fs.readdirSync(docDir).filter(f => f.endsWith('.md'))
      const mainFile = files.includes('总结.md') ? '总结' : files[0]?.replace('.md', '') || ''

      // Clean up the name: remove date prefix
      const cleanName = doc.name.replace(/^\d{2}月\d{2}日\d{2}时\d{2}分-/, '')

      return {
        text: cleanName,
        link: `/${basePath}/${cat.name}/${doc.name}/${mainFile}`
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
  title: 'LangChain 技术文档',
  description: 'LangChain / LangGraph / DeepAgent 官方文档中文走读',

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
      { icon: 'github', link: 'https://github.com/' }
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
  lastUpdated: true
}))
