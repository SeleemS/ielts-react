import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import ReadingQuestion from './pages/ReadingQuestion';
import WritingQuestion from './pages/WritingQuestion';
import PrivacyPolicy from './pages/PrivacyPolicy';
import TermsOfService from './pages/TermsOfService';
import ContactUs from './pages/ContactUs';
import ReactGA from 'react-ga';
ReactGA.initialize('G-1KRYZZY68X');


function App() {
  return (
      <Router>
          <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/ielts-react" element={<HomePage />} />
              <Route path="/readingquestion/:id" element={<ReadingQuestion />} />
              <Route path="/writingquestion/:id" element={<WritingQuestion />} />
              <Route path="/privacypolicy/" element={<PrivacyPolicy />} />
              <Route path="/termsofservice/" element={<TermsOfService />} />
              <Route path="/contactus/" element={<ContactUs />} />

              {/* ... other routes */}
          </Routes>
      </Router>
  );
}

export default App;
