import React from 'react';

const StatsCard = ({ icon, title, value, color }) => {
  return (
    <div className="bg-white p-6 rounded-lg shadow hover:shadow-md transition-shadow duration-300">
      <div className="flex items-center">
        <div className={`${color} p-2 rounded`}>
          {icon}
        </div>
        <div className="ml-4">
          <h3 className="text-sm font-medium text-gray-500">{title}</h3>
          <p className="text-2xl font-semibold mt-1">{value}</p>
        </div>
      </div>
    </div>
  );
};

export default StatsCard;