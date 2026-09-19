import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { validate } from '../utils/index.js';
import { imagesArray, singleImage } from '../middleware/upload.js';
import {
  reviewSchema,
  reviewUpdateSchema,
  gallerySchema,
  galleryUpdateSchema,
  blogSchema,
  blogUpdateSchema,
  faqSchema,
  faqUpdateSchema,
  settingsSchema,
} from '../validators/content.validator.js';
import {
  getFaqs,
  getAdminFaqs,
  postFaq,
  putFaq,
  removeFaq,
  getReviews,
  getAdminReviews,
  postReview,
  putReview,
  approveReview,
  removeReview,
  getGallery,
  getAdminGallery,
  postGalleryItem,
  putGalleryItem,
  removeGalleryItem,
  getBlogs,
  getBlogBySlug,
  getAdminBlogs,
  postBlog,
  putBlog,
  removeBlog,
  getSettings,
  getPublicSetting,
  upsertSetting,
} from '../controllers/content.controller.js';

const publicRouter = express.Router();
publicRouter.get('/faqs', getFaqs);
publicRouter.get('/reviews', getReviews);
publicRouter.post('/reviews', validate(reviewSchema.omit({ status: true })), postReview);
publicRouter.get('/gallery', getGallery);
publicRouter.get('/blog', getBlogs);
publicRouter.get('/blog/:slug', getBlogBySlug);
publicRouter.get('/settings/:key', getPublicSetting);

const adminRouter = express.Router();
adminRouter.use(protect, authorize('SUPER_ADMIN', 'ADMIN'));

// FAQ
adminRouter.get('/faqs', getAdminFaqs);
adminRouter.post('/faqs', validate(faqSchema), postFaq);
adminRouter.put('/faqs/:id', validate(faqUpdateSchema), putFaq);
adminRouter.delete('/faqs/:id', removeFaq);

// Reviews
adminRouter.get('/reviews', getAdminReviews);
adminRouter.put('/reviews/:id', validate(reviewUpdateSchema), putReview);
adminRouter.patch('/reviews/:id/approve', approveReview);
adminRouter.delete('/reviews/:id', removeReview);

// Gallery
adminRouter.get('/gallery', getAdminGallery);
adminRouter.post('/gallery', imagesArray, validate(gallerySchema), postGalleryItem);
adminRouter.put('/gallery/:id', imagesArray, validate(galleryUpdateSchema), putGalleryItem);
adminRouter.delete('/gallery/:id', removeGalleryItem);

// Blog
adminRouter.get('/blog', getAdminBlogs);
adminRouter.post('/blog', singleImage, validate(blogSchema), postBlog);
adminRouter.put('/blog/:id', singleImage, validate(blogUpdateSchema), putBlog);
adminRouter.delete('/blog/:id', removeBlog);

// Settings
adminRouter.get('/settings', getSettings);
adminRouter.put('/settings', validate(settingsSchema), upsertSetting);

export default { publicRouter, adminRouter };