import React from 'react';

export default function useToast() {
  const [toasts, setToasts] = React.useState([]);

  const showToast = ({ message, delay, color, backgroundColor, title }) => {
    const toast = {
      id: toasts.length,
      message,
      delay,
      backgroundColor,
      color,
      title,
    };
    setToasts([...toasts, toast].reverse());
  };

  const onToastFinished = (id) => {
    setToasts(toasts.filter((toast) => toast.id !== id));
  };

  return [showToast, onToastFinished, toasts];
}
