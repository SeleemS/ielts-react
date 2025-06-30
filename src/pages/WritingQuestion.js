import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { app } from '../firebase';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

const WritingQuestion = () => {
  const [passageText, setPassageText] = useState('');
  const [passageTitle, setPassageTitle] = useState('');
  const [userResponse, setUserResponse] = useState('');
  const [apiResponse, setApiResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { id: docId } = router.query;

  useEffect(() => {
    const fetchData = async () => {
      const db = getFirestore(app);
      const docRef = doc(db, 'writingPassages', docId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setPassageText(data.passageText);
        setPassageTitle(data.passageTitle);
      }
    };
    if (docId) fetchData();
  }, [docId]);

  const countWords = text => text.split(/\s+/).filter(Boolean).length;

  const handleSubmit = async () => {
    const wordCount = countWords(userResponse);
    if (wordCount < 250) {
      alert(`Your answer must be at least 250 words long. Current count: ${wordCount}`);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch('https://wamm2ytjk5.execute-api.us-east-1.amazonaws.com/IELTSWritingBot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: passageText, answer: userResponse }),
      });
      if (response.ok) {
        const data = await response.json();
        setApiResponse(data.message);
      } else {
        alert('Failed to score the answer. Please try again.');
      }
    } catch (e) {
      alert('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <Navbar />
      <div className="container mx-auto my-5 flex flex-col md:flex-row space-x-0 md:space-x-2">
        <div className="flex-1 p-5 border max-h-[75vh] overflow-y-auto">
          <h2 className="font-bold mb-4">{passageTitle}:</h2>
          <div dangerouslySetInnerHTML={{ __html: passageText }} />
        </div>
        <div className="flex-1 p-5 border flex flex-col max-h-[75vh] overflow-y-auto">
          <div className="flex items-center mb-2">
            <span className="font-bold mr-2">Your Response:</span>
            <span className="text-sm font-bold text-gray-600">({countWords(userResponse)} words / 250)</span>
          </div>
          <textarea
            className="border p-2 flex-1 mb-4"
            value={userResponse}
            onChange={e => setUserResponse(e.target.value)}
            placeholder="Type your response here..."
          />
          <button onClick={handleSubmit} className="bg-black text-white px-4 py-2 rounded self-center">Submit</button>
          {loading && <p className="mt-2">Scoring your response...</p>}
          {apiResponse && <div className="mt-4" dangerouslySetInnerHTML={{ __html: apiResponse }} />}
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default WritingQuestion;
