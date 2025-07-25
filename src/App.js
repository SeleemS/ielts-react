import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import HomePage from './pages/HomePage';
import ReadingQuestion from './pages/ReadingQuestion';
import WritingQuestion from './pages/WritingQuestion';
import ListeningQuestion from './pages/ListeningQuestion';
import SpeakingQuestion from './pages/SpeakingQuestion';
import PrivacyPolicy from './pages/PrivacyPolicy';
import TermsOfService from './pages/TermsOfService';
import NotFoundPage from './pages/NotFoundPage';
import ContactUs from './pages/ContactUs';
import BlogIndex from './pages/blog/index';
import BlogPost from './pages/blog/[slug]';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import ReactGA from 'react-ga';
import { Analytics } from '@vercel/analytics/react';

ReactGA.initialize('G-1KRYZZY68X');

const PageTracker = () => {
  const location = useLocation();
  useEffect(() => {
    ReactGA.pageview(location.pathname + location.search);
  }, [location]);
  return null;
};

function App() {
  return (
    <Router>
      <Navbar />
      <PageTracker />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/index.html" element={<HomePage />} />
        <Route path="/ielts-react/" element={<HomePage />} />
        <Route path="/ielts-react/readingquestion/:id" element={<ReadingQuestion />} />
        <Route path="/ielts-react/writingquestion/:id" element={<WritingQuestion />} />
        <Route path="/ielts-react/listeningquestion/:id" element={<ListeningQuestion />} />
        <Route path="/ielts-react/speakingquestion/:id" element={<SpeakingQuestion />} />
        <Route path="/privacypolicy/" element={<PrivacyPolicy />} />
        <Route path="/termsofservice/" element={<TermsOfService />} />
        <Route path="/contactus/" element={<ContactUs />} />
        <Route path="/blog" element={<BlogIndex />} />
        <Route path="/blog/:slug" element={<BlogPost />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      <Footer />
      <Analytics />
    </Router>
  );
}

export default App;
