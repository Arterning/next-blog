import fs from 'fs/promises';
import matter from 'gray-matter';
import { marked } from 'marked';
import path from 'path';

// 递归读取目录下所有 .md 文件
async function getAllMdFiles(dirPath) {
  let results = [];
  
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    // 按名称倒序排列（从 Z 到 A）
    entries.sort((a, b) => {
      // 不区分大小写排序
      const nameA = a.name.toLowerCase();
      const nameB = b.name.toLowerCase();
      
      if (nameA > nameB) return -1;  // 倒序排列
      if (nameA < nameB) return 1;
      return 0;
    });

    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      
      if (entry.isDirectory()) {
        // 如果是目录，递归读取
        const nestedResults = await getAllMdFiles(fullPath);
        results = [...results, ...nestedResults];
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        // 如果是 .md 文件，添加到结果中
        // 计算相对路径（相对于 content/posts 目录）
        const relativePath = path.relative('content/posts', fullPath);
        results.push(relativePath);
      }
    }
  } catch (error) {
    console.error(`读取目录失败: ${dirPath}`, error);
  }

  return results;
}

export async function getPost(slug) {
  // 首先尝试直接使用 slug 查找文件
  let filePath = `content/posts/${slug}.md`;
  
  // 检查文件是否存在，如果不存在，尝试查找包含哈希值的文件名
  try {
    await fs.access(filePath);
  } catch (error) {
    // 文件不存在，查找匹配的文件名（可能包含哈希值）
    const allMdFiles = await getAllMdFiles('content/posts');
    
    // 先尝试精确匹配（去掉扩展名和可能的哈希值）
    let matchingFile = allMdFiles.find(file => {
      const baseName = path.basename(file, '.md');
      return baseName.replace(/\s+[0-9a-f]{28,36}$/i, '') === slug;
    });
    
    // 如果精确匹配失败，尝试更宽松的匹配（例如对于中文文件名）
    if (!matchingFile) {
      matchingFile = allMdFiles.find(file => {
        const fileName = path.basename(file);
        return fileName.endsWith('.md') && 
               fileName.includes(slug) && 
               fileName.indexOf(slug) === 0;
      });
    }
    
    if (matchingFile) {
      filePath = path.join('content/posts', matchingFile);
    } else {
      // 如果找不到匹配的文件，抛出错误
      throw new Error(`找不到文章: ${slug}`);
    }
  }
  
  const source = await fs.readFile(filePath, 'utf8');
  const { data, content } = matter(source);
  
  // 如果没有定义 date，使用文件的创建日期
  let date = data.date;
  if (!date) {
    try {
      const stats = await fs.stat(filePath);
      date = stats.birthtime.toISOString().split('T')[0]; // 格式化为 YYYY-MM-DD
    } catch (error) {
      date = new Date().toISOString().split('T')[0]; // 如果获取不到创建日期，使用当前日期
    }
  }
  
  // 如果没有定义 title，使用 slug 作为标题
  let title = data.title;
  if (!title) {
    // 将 slug 转换为更友好的标题格式（例如将连字符替换为空格，首字母大写）
    title = slug.split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
  
  const body = marked(content);
  return { date, title, body };
}

export async function getPosts() {
  const slugs = await getSlugs();
  const posts = [];
  for (const slug of slugs) {
    try {
      const post = await getPost(slug);
      posts.push({ slug, ...post });
    } catch (error) {
      console.error(`获取文章失败: ${slug}`, error);
      // 继续处理其他文章，不中断整个流程
    }
  }
  return posts;
}

export async function getSlugs() {
  const allMdFiles = await getAllMdFiles('content/posts');
  
  // 处理每个文件路径，生成对应的 slug
  return allMdFiles.map(file => {
    // 去掉扩展名
    let baseName = path.basename(file, '.md');
    
    // 处理 Notion 导出的文件名，移除末尾的哈希值
    const hashPattern = /\s+[0-9a-f]{28,36}$/i; // 匹配28-36位的十六进制字符（可能包括连字符）
    if (hashPattern.test(baseName)) {
      baseName = baseName.replace(hashPattern, '');
    }
    
    // 移除可能存在的其他特殊字符或格式
    baseName = baseName.trim();
    
    return baseName;
  });
}
