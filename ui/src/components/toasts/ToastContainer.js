import Toast from './Toast';
import React from 'react';

export default function ToastsContainer({ toasts, onToastFinished }) {
  return (
    <div className="toasts-container">
      {toasts.map((toast, index) => (
        <Toast key={index} {...toast} onHide={onToastFinished} />
      ))}
    </div>
  );
}
