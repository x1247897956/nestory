import {act, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';
import {setLanguage} from '../../i18n/language';
import {EventTimeline} from './EventTimeline';
import type {EventProperties} from './Events';
afterEach(() => act(() => setLanguage('zh-CN')));
it('switches timeline labels and dates while preserving Chinese user titles and the selected range', () => {
 const onOpen=vi.fn(),onDateChange=vi.fn();
 const event={id:'a',title:'跨周计划',start_at:'2026-10-28T09:00:00Z',end_at:'2026-10-28T10:00:00Z'} as EventProperties;
 render(<EventTimeline events={[event]} date="2026-10-28" span="week" zone="UTC" onDateChange={onDateChange} onSpanChange={vi.fn()} onOpen={onOpen} loading={false} error={false} onRetry={vi.fn()}/>);
 expect(screen.getByLabelText('日程时间轴')).toBeVisible();
 act(() => setLanguage('en'));
 expect(screen.getByLabelText('Event timeline')).toBeVisible();
 expect(screen.getByText('Wed')).toBeVisible();
 fireEvent.click(screen.getByRole('button',{name:/跨周计划, .* to /}));
 expect(onOpen).toHaveBeenCalledWith('a');
 fireEvent.click(screen.getByRole('button',{name:'Next range'}));
 expect(onDateChange).toHaveBeenCalledWith('2026-11-02');
});
