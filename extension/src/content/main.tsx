import { installLeetCodeIntegration } from '../leetcode/integration';

if (location.hostname === 'leetcode.com' && location.pathname.startsWith('/problems/')) {
  installLeetCodeIntegration();
}
