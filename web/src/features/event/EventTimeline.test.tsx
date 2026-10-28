import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { EventTimeline } from './EventTimeline';
import type { CalendarEvent } from './Events';
const event={id:'a',title:'跨周计划',start_at:'2026-10-25T09:00:00Z',end_at:'2026-10-28T09:00:00Z'} as CalendarEvent;
const props={events:[event],date:'2026-10-28',span:'week' as const,zone:'UTC',onDateChange:vi.fn(),onSpanChange:vi.fn(),onOpen:vi.fn(),loading:false,error:false,onRetry:vi.fn()};
it('opens event details from a clipped bar and navigates calendar ranges',()=>{
 render(<EventTimeline {...props}/>);
 fireEvent.click(screen.getByRole('button',{name:/跨周计划，/}));
 expect(props.onOpen).toHaveBeenCalledWith('a');
 fireEvent.click(screen.getByRole('button',{name:'下一区间'}));
 expect(props.onDateChange).toHaveBeenCalledWith('2026-11-02');
 fireEvent.click(screen.getByRole('button',{name:'月'}));
 expect(props.onSpanChange).toHaveBeenCalledWith('month');
 expect(screen.getByLabelText('横向滚动日程时间轴')).toHaveAttribute('tabindex','0');
});
it('shows loading, retryable failure and empty range states',()=>{
 const view=render(<EventTimeline {...props} loading/>);
 expect(screen.getByRole('status')).toHaveTextContent('加载日程');
 view.rerender(<EventTimeline {...props} error/>);
 fireEvent.click(screen.getByRole('button',{name:'重试'}));
 expect(props.onRetry).toHaveBeenCalled();
 view.rerender(<EventTimeline {...props} events={[]}/>);
 expect(screen.getByText('此区间暂无日程')).toBeVisible();
});
