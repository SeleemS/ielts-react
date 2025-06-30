import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import { app } from '../firebase';

const DataTable = ({ selectedOption }) => {
  const [data, setData] = useState([]);
  const [cache, setCache] = useState({});
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const resultsPerPage = 10;
  const router = useRouter();

  useEffect(() => {
    async function fetchData() {
      if (cache[selectedOption]) {
        const cachedData = cache[selectedOption];
        setData(cachedData);
        setTotalPages(Math.ceil(cachedData.length / resultsPerPage));
      } else {
        setLoading(true);
        const db = getFirestore(app);
        const collectionName = `${selectedOption.toLowerCase()}Passages`;
        const querySnapshot = await getDocs(collection(db, collectionName));
        const fetchedData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setData(fetchedData);
        setTotalPages(Math.ceil(fetchedData.length / resultsPerPage));
        setLoading(false);
        setCache(prev => ({ ...prev, [selectedOption]: fetchedData }));
      }
    }
    fetchData();
  }, [selectedOption, cache]);

  const handleRowClick = id => {
    router.push(`/${selectedOption.toLowerCase()}question/${id}`);
  };

  const getDifficultyColor = difficulty => ({
    Hard: 'text-red-600',
    Medium: 'text-yellow-600',
    Easy: 'text-green-600',
    'Task 2': 'text-black',
  }[difficulty] || 'text-gray-600');

  return (
    <div className="overflow-x-auto min-h-[400px]">
      {loading ? (
        <div className="flex flex-col items-center justify-center h-full">
          <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent" />
          <p className="mt-3 text-xl">Loading...</p>
        </div>
      ) : (
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b">
              <th className="font-bold p-2">#</th>
              <th className="font-bold p-2">Title</th>
              <th className="font-bold p-2">Difficulty</th>
            </tr>
          </thead>
          <tbody>
            {data
              .slice((currentPage - 1) * resultsPerPage, currentPage * resultsPerPage)
              .map((item, index) => (
                <tr
                  key={item.id}
                  onClick={() => handleRowClick(item.id)}
                  className={`cursor-pointer ${index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}`}
                >
                  <td className="p-2">{(currentPage - 1) * resultsPerPage + index + 1}</td>
                  <td className="p-2">{item.passageTitle}</td>
                  <td className={`p-2 font-bold ${getDifficultyColor(item.passageDifficulty)}`}>{item.passageDifficulty}</td>
                </tr>
              ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default DataTable;
