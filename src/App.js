import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import ReadingQuestion from './pages/ReadingQuestion';
import WritingQuestion from './pages/WritingQuestion';

function App() {
  return (
      <Router>
          <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/readingquestion/:id" element={<ReadingQuestion />} />
              <Route path="/writingquestion/:id" element={<WritingQuestion />} />
              {/* ... other routes */}
          </Routes>
      </Router>
  );
}

export default App;
