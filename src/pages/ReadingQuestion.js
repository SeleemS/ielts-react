import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { app } from '../firebase';
import Navbar from '../components/Navbar';
import ShareButton from '../components/ShareButton';
import Footer from '../components/Footer';

const ReadingQuestion = () => {
  const [passageText, setPassageText] = useState('');
  const [passageTitle, setPassageTitle] = useState('');
  const [questionGroups, setQuestionGroups] = useState([]);
  const [userAnswers, setUserAnswers] = useState({});
  const [result, setResult] = useState(null);
  const router = useRouter();
  const { id: passageId } = router.query;

  useEffect(() => {
    const fetchData = async () => {
      const db = getFirestore(app);
      const docRef = doc(db, 'readingPassages', passageId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setPassageText(data.passageText);
        setQuestionGroups(data.questionGroups);
        setPassageTitle(data.passageTitle);
      }
    };
    if (passageId) fetchData();
  }, [passageId]);

  const handleAnswerChange = (e, q) => {
    setUserAnswers(prev => ({ ...prev, [q]: e.target.value.trim().toLowerCase() }));
  };

  const handleSubmit = async () => {
    const db = getFirestore(app);
    const questionDoc = doc(db, 'readingPassages', passageId);
    const docSnapshot = await getDoc(questionDoc);
    if (docSnapshot.exists()) {
      const data = docSnapshot.data();
      let correct = 0;
      let idx = 1;
      data.questionGroups.forEach(group => {
        group.questions.forEach(q => {
          const correctAnswer = q.answer.toLowerCase();
          const userAnswer = userAnswers[idx] || '-';
          if (userAnswer === correctAnswer) correct++;
          idx++;
        });
      });
      setResult(`You answered ${correct} out of ${idx - 1} questions correctly!`);
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
        <div className="flex-1 p-5 border max-h-[75vh] overflow-y-auto">
          {questionGroups.map((group, groupIndex) => (
            <div key={groupIndex} className="mb-6">
              <p className="font-bold mb-2">{group.prompt}</p>
              {group.questions.map((q, index) => (
                <div key={index} className="mb-4">
                  <p className="mb-1 font-medium">{index + 1}. {q.text}</p>
                  {q.questionType === 'Short Answer' ? (
                    <input
                      type="text"
                      className="border p-2 w-full"
                      onChange={e => handleAnswerChange(e, index + 1)}
                    />
                  ) : (
                    <select
                      className="border p-2 w-full"
                      onChange={e => handleAnswerChange(e, index + 1)}
                    >
                      <option value="" disabled selected>
                        -
                      </option>
                      {(q.questionType === 'Match' ? q.options : ['true', 'false', 'not given', 'yes', 'no']).map(
                        (opt, idx) => (
                          <option key={idx} value={opt}>
                            {opt}
                          </option>
                        )
                      )}
                    </select>
                  )}
                </div>
              ))}
            </div>
          ))}
          {result && <p className="font-bold my-4">{result}</p>}
          <div className="flex space-x-2">
            <button onClick={handleSubmit} className="bg-black text-white px-4 py-2 rounded">
              Submit
            </button>
            <ShareButton title={passageTitle} url={typeof window !== 'undefined' ? window.location.href : ''} text="Check out this IELTS question!" />
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default ReadingQuestion;
