import React from 'react';
import { ThemeProvider, themes, ensure } from '@storybook/theming';

export const decorators = [
  (Story: React.ComponentClass): JSX.Element => (
    <ThemeProvider theme={ensure(themes.light)}>
      <Story />
    </ThemeProvider>
  ),
];
