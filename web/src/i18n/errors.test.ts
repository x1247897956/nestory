import {afterEach,expect,it} from 'vitest';
import {setLanguage} from './language';
import {t,translateError} from './index';
afterEach(()=>setLanguage('zh-CN'));
it('preserves exact validation limits and recovery instructions in English errors',()=>{
 setLanguage('en');
 expect(translateError('正文超过 2 MiB，请缩减内容或拆分为多篇笔记；草稿未丢弃')).toBe('The body exceeds 2 MiB. Reduce the content or split it into multiple notes. Your draft has been preserved.');
 expect(translateError('无法保存创建请求的恢复信息，请恢复浏览器存储后重试。')).toBe('Could not save recovery information for the creation request. Restore browser storage access and try again.');
 expect(translateError('属性名称须为1–80个字符')).toBe('Property names must contain 1–80 characters.');
});
it('recursively translates error context while preserving a server-provided batch identifier',()=>{
 setLanguage('en');
 expect(translateError('阶段更新失败，请重试：父任务调整失败：请先恢复仍在回收站的父对象，所需批次：备份草稿-007')).toBe('Failed to update stage. Please retry: Failed to change parent task: Restore the parent object from the trash first. Required batch: 备份草稿-007');
 expect(translateError('上传失败：附件超过上传大小限制')).toBe('Upload failed: The attachment exceeds the upload size limit.');
 expect(translateError('正文加载失败，原始内容未修改：属性名称须为1–80个字符')).toBe('Content could not load. Original content retained: Property names must contain 1–80 characters.');
});
it('keeps Chinese source errors intact and uses a clear English fallback for unknown Chinese errors',()=>{
 const source='阶段更新失败，请重试：未知错误：用户资料';
 expect(translateError(source)).toBe(source);
 setLanguage('en');
 expect(translateError('无法识别的新错误','conflict')).toBe('This item changed. Refresh and try again.');
 expect(translateError('Network request failed')).toBe('Network request failed');
 expect(t('请先恢复仍在回收站的父对象，所需批次：{batch}',{batch:'项目-123'})).toBe('Restore the parent object from the trash first. Required batch: 项目-123');
});
