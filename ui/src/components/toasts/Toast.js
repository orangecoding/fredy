import React from 'react';

import './Toasts.css';

export default function Toast({ id, delay = 5500, message, onHide, backgroundColor, color, title }) {
  const [className, setClassname] = React.useState('toast-container show-toast');

  React.useEffect(() => {
    let hideTimeout = null;
    const timeout = setTimeout(() => {
      setClassname('toast-container hide-toast');
      hideTimeout = setTimeout(() => {
        onHide && onHide(id);
      }, 500);
    }, delay);
    return () => {
      clearTimeout(timeout);
      clearTimeout(hideTimeout);
    };
  }, [id, delay, onHide]);
  return (
    <div className={className} style={{ backgroundColor, color }}>
      <h5>{title}</h5>
      {message}
    </div>
  );
}
