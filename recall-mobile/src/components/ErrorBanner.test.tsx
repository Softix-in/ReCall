import { fireEvent, render } from '@testing-library/react-native';
import { ErrorBanner } from './ErrorBanner';

describe('ErrorBanner', () => {
  it('T1.8 renders the message and calls retry', () => {
    const onRetry = jest.fn();
    const { getByText } = render(
      <ErrorBanner message="Network error. Check your connection and retry." onRetry={onRetry} />,
    );

    expect(getByText('Network error. Check your connection and retry.')).toBeTruthy();
    fireEvent.press(getByText('Retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
