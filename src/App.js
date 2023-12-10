import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import ReadingQuestion from './pages/ReadingQuestion';

function App() {
  return (
      <Router>
          <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/readingquestion/:id" element={<ReadingQuestion />} />
              {/* ... other routes */}
          </Routes>
      </Router>
  );
}

export default App;
