import React, {useEffect} from 'react';
import { Box, Flex, VStack, Text, useBreakpointValue } from '@chakra-ui/react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

const PrivacyPolicy = () => {

    useEffect(() => {
        setTimeout(() => {
          (window.adsbygoogle = window.adsbygoogle || []).push({});
        }, 1000); // Adjust the delay as needed
      }, []);
    
    const adDisplay = useBreakpointValue({ base: 'none', md: 'block' });

    return (
        <Box>
            <Navbar />
            <Flex
                direction={{ base: "column", md: "row" }}
                justify="space-between"
                align="center"
                wrap="wrap"
                px={{ md: 8 }} // Horizontal padding on medium and larger screens
                py={6}
            >
                {/* Left Ad Container */}
                <Flex display={adDisplay} width="300px" height="600px" bg="gray.200" mx={2} justifyContent="center" alignItems="center">
                    <ins className="adsbygoogle"
                        style={{ display: "block" }}
                        data-ad-client="ca-pub-5189362957619937"
                        data-ad-slot="7564021019"
                        data-ad-format="auto"
                        data-full-width-responsive="true"></ins>
                </Flex>

                {/* Privacy Policy Content */}
                <VStack spacing={4} flex="1" minWidth="300px" px={4}>
                    <Text fontSize="2xl" fontWeight="bold">Privacy Policy</Text>
                    <Box overflowY="auto" maxH="70vh" width="100%">
                        {/* Privacy Policy Text */}
                        <Text>

                            Welcome to IELTSBank. This privacy policy outlines our policies regarding the collection, use, and disclosure of information we receive from users of our site.<br /><br />

                            <strong>Information Collection and Use</strong><br />
                            IELTSBank does not collect any personally identifiable information from its users. Our users are free to visit our site anonymously, and we do not require any personal data for access to most of our services.<br /><br />

                            <strong>Log Data</strong><br />
                            We do not collect information that your browser sends (known as "Log Data") when you visit our Site. This means we do not track information such as your computer's Internet Protocol ("IP") address, browser type, browser version, and the pages of our Site that you visit.<br /><br />

                            <strong>Cookies and Tracking</strong><br />
                            IELTSBank does not use cookies or any form of tracking to collect information about users. Your privacy is respected at all times when you visit our website.<br /><br />

                            <strong>Data Security</strong><br />
                            Since we do not collect personal data, there is no risk of such data being exposed or misused. We are committed to ensuring the security and privacy of our visitors.<br /><br />

                            <strong>Changes to This Privacy Policy</strong><br />
                            This Privacy Policy is effective as of the last updated date and will remain in effect except with respect to any changes in its provisions in the future, which will be in effect immediately after being posted on this page. We reserve the right to update or change our Privacy Policy at any time and you should check this Privacy Policy periodically.<br /><br />

                            <strong>Last Updated:</strong> December 11, 2023<br /><br />
                            If you have any questions about this Privacy Policy, please contact us.
                        </Text>
                    </Box>
                </VStack>

                {/* Right Ad Container */}
                <Flex display={adDisplay} width="300px" height="600px" bg="gray.200" mx={2} justifyContent="center" alignItems="center">
                    <ins className="adsbygoogle"
                        style={{ display: "block" }}
                        data-ad-client="ca-pub-5189362957619937"
                        data-ad-slot="7564021019"
                        data-ad-format="auto"
                        data-full-width-responsive="true"></ins>
                </Flex>
            </Flex>
            <Footer />
        </Box>
    );
};

export default PrivacyPolicy;
