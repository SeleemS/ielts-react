import React, { useState } from 'react';

const Toggle = ({ onChange }) => {
  const [selected, setSelected] = useState('Reading');
  const options = ['Reading', 'Writing'];
  const sliderLeft = `${options.indexOf(selected) * (100 / options.length)}%`;

  const handleSelect = option => {
    setSelected(option);
    if (onChange) onChange(option);
  };

  return (
    <div className="relative flex w-full max-w-[90vw] border border-gray-200 rounded-md bg-white text-sm">
      <div
        className="absolute top-0 left-0 h-full bg-black rounded-md transition-all"
        style={{ left: sliderLeft, width: `${100 / options.length}%` }}
      />
      {options.map(option => (
        <button
          key={option}
          className={`flex-1 z-10 py-2 font-bold ${selected === option ? 'text-white' : 'text-gray-600'}`}
          onClick={() => handleSelect(option)}
        >
          {option}
        </button>
      ))}
    </div>
  );
};

export default Toggle;
