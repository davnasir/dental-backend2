import prisma from '../config/prisma.js';
import { ApiError } from '../utils/apiResponse.js';

const publicBlogSelect = {
  id: true,
  title: true,
  slug: true,
  excerpt: true,
  content: true,
  featuredImage: true,
  category: true,
  categoryTitle: true,
  author: true,
  status: true,
  readTime: true,
  publishedAt: true,
  createdAt: true,
};

export const listPublicBlogs = async ({ category, search, lang } = {}) => {
  const where = {
    status: 'PUBLISHED',
    ...(category ? { category } : {}),
    ...(search
      ? {
          OR: [
            { title: { path: [lang || 'en'], string_contains: search } },
            { excerpt: { path: [lang || 'en'], string_contains: search } },
          ],
        }
      : {}),
  };
  return prisma.blog.findMany({
    where,
    orderBy: { publishedAt: 'desc' },
    select: publicBlogSelect,
  });
};

export const getPublicBlogBySlug = async (slug) => {
  const blog = await prisma.blog.findFirst({
    where: { slug, status: 'PUBLISHED' },
    select: publicBlogSelect,
  });
  if (!blog) throw new ApiError(404, 'Blog post not found');
  return blog;
};

export const getAllBlogs = async ({ page = 1, limit = 20, status, search }) => {
  const skip = (Number(page) - 1) * Number(limit);
  const where = {
    ...(status ? { status } : {}),
    ...(search ? { OR: [{ title: { path: ['en'], string_contains: search } }, { slug: { contains: search } }] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.blog.findMany({ where, skip, take: Number(limit), orderBy: { createdAt: 'desc' } }),
    prisma.blog.count({ where }),
  ]);
  return { items, total, page: Number(page), limit: Number(limit) };
};

export const createBlog = async (data) => {
  const slug = data.slug || slugify(data.title.en || data.title.bn || 'blog-post');
  const existing = await prisma.blog.findUnique({ where: { slug } });
  if (existing) throw new ApiError(409, 'A blog post with this slug already exists');
  return prisma.blog.create({
    data: {
      ...data,
      slug,
      author: data.author || 'Nahol Dental Care',
      status: data.status || 'DRAFT',
      publishedAt: data.status === 'PUBLISHED' ? new Date() : data.publishedAt || null,
    },
    select: publicBlogSelect,
  });
};

export const updateBlog = async (id, data) => {
  const blog = await prisma.blog.findUnique({ where: { id: Number(id) } });
  if (!blog) throw new ApiError(404, 'Blog post not found');

  const shouldPublish = data.status === 'PUBLISHED' && blog.status !== 'PUBLISHED';
  return prisma.blog.update({
    where: { id: blog.id },
    data: {
      ...data,
      publishedAt: shouldPublish ? new Date() : data.publishedAt ?? blog.publishedAt,
    },
    select: publicBlogSelect,
  });
};

export const deleteBlog = async (id) => {
  const blog = await prisma.blog.findUnique({ where: { id: Number(id) } });
  if (!blog) throw new ApiError(404, 'Blog post not found');
  await prisma.blog.delete({ where: { id: blog.id } });
};

const slugify = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);