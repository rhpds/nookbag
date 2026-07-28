import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import ProgressBar from './progress-bar';

describe('ProgressBar', () => {
  const modules = [
    { name: 'module-01' },
    { name: 'module-02' },
    { name: 'module-03' },
  ];

  it('renders correct number of segments', () => {
    const { container } = render(
      <ProgressBar
        modules={modules}
        progress={{ current: 'module-01', inProgress: [], notStarted: ['module-02', 'module-03'], completed: [] }}
      />
    );
    const segments = container.querySelectorAll('.progress-bar__item');
    expect(segments).toHaveLength(3);
  });

  it('marks current module with is-current class', () => {
    const { container } = render(
      <ProgressBar
        modules={modules}
        progress={{ current: 'module-02', inProgress: [], notStarted: ['module-03'], completed: ['module-01'] }}
      />
    );
    const segments = container.querySelectorAll('.progress-bar__item');
    expect(segments[1]).toHaveClass('is-current');
  });

  it('marks completed modules with completed class', () => {
    const { container } = render(
      <ProgressBar
        modules={modules}
        progress={{ current: 'module-03', inProgress: [], notStarted: [], completed: ['module-01', 'module-02'] }}
      />
    );
    const segments = container.querySelectorAll('.progress-bar__item');
    expect(segments[0]).toHaveClass('completed');
    expect(segments[1]).toHaveClass('completed');
  });

  it('marks not-started modules with not-started class', () => {
    const { container } = render(
      <ProgressBar
        modules={modules}
        progress={{ current: 'module-01', inProgress: [], notStarted: ['module-02', 'module-03'], completed: [] }}
      />
    );
    const segments = container.querySelectorAll('.progress-bar__item');
    expect(segments[1]).toHaveClass('not-started');
    expect(segments[2]).toHaveClass('not-started');
  });

  it('handles single module', () => {
    const { container } = render(
      <ProgressBar
        modules={[{ name: 'only' }]}
        progress={{ current: 'only', inProgress: [], notStarted: [], completed: [] }}
      />
    );
    const segments = container.querySelectorAll('.progress-bar__item');
    expect(segments).toHaveLength(1);
    expect(segments[0]).toHaveClass('is-current');
  });

  it('handles all modules completed', () => {
    const { container } = render(
      <ProgressBar
        modules={modules}
        progress={{ current: '', inProgress: [], notStarted: [], completed: ['module-01', 'module-02', 'module-03'] }}
      />
    );
    const segments = container.querySelectorAll('.progress-bar__item');
    expect(segments[0]).toHaveClass('completed');
    expect(segments[1]).toHaveClass('completed');
    expect(segments[2]).toHaveClass('completed');
  });

  it('renders progress label', () => {
    const { container } = render(
      <ProgressBar
        modules={modules}
        progress={{ current: 'module-01', inProgress: [], notStarted: [], completed: [] }}
      />
    );
    expect(container.querySelector('.progress-bar__label')).toHaveTextContent('Progress');
  });
});
