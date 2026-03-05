import DOMPurify from 'dompurify';
import MarkdownIt from 'markdown-it';

const markdownRenderer = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
});

const sanitizeHtml = (html: string) =>
  DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });

const sanitizePlainText = (text: string) =>
  DOMPurify.sanitize(text, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });

const normalizeMarkdownInput = (markdown: string) =>
  markdown.replace(/\\n/g, '\n').replace(/<script[\s\S]*?<\/script>/gi, '');

export const renderMarkdown = (markdown: string): string => {
  if (!markdown) {
    return '';
  }

  try {
    const normalized = normalizeMarkdownInput(markdown);
    const html = markdownRenderer.render(normalized);
    return sanitizeHtml(html);
  } catch (error) {
    return sanitizePlainText(markdown);
  }
};
