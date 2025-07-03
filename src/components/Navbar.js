import React from 'react';
import {
  Flex,
  Box,
  Spacer,
  Image,
  Text,
  IconButton,
  useDisclosure,
  Collapse,
  VStack,
  Link,
  Container
} from '@chakra-ui/react';
import { HamburgerIcon } from '@chakra-ui/icons';
import NextLink from 'next/link';

const Navbar = () => {
    const { isOpen, onToggle } = useDisclosure();

    return (
        <Box bg="white" borderBottom="1px" borderColor="gray.100" position="sticky" top="0" zIndex="1000" boxShadow="sm">
            <Container maxW="container.xl">
                <Flex as="header" p={4} color="gray.800" align="center" position="relative">
                    {/* Logo and Title */}
                    <Link as={NextLink} href="/" _hover={{ textDecoration: 'none' }}>
                        <Flex align="center">
                            <Box p="1">
                                <Image src="/image.png" alt="IELTS-Bank Logo" boxSize="40px" />
                            </Box>
                            <Text fontSize="xl" fontWeight="700" ml={3} color="gray.900">
                                IELTS-Bank
                            </Text>
                        </Flex>
                    </Link>

                    <Spacer />

                    {/* Menu Icon */}
                    <IconButton
                        icon={<HamburgerIcon color="gray.600"/>}
                        variant="ghost"
                        aria-label="Menu"
                        onClick={onToggle}
                        size="md"
                        _hover={{ bg: 'gray.50' }}
                    />

                    {/* Expandable Menu Items */}
                    {isOpen && (
                      <Collapse in={isOpen} animateOpacity>
                            <VStack
                                position="absolute"
                                top="100%"
                                right="0"
                                bg="white"
                                w="200px"
                                mt={2}
                                rounded="lg"
                                shadow="lg"
                                border="1px"
                                borderColor="gray.100"
                                zIndex="10"
                                mr={1}
                                py={2}
                            >
                                <Link 
                                    as={NextLink} 
                                    href="/" 
                                    p={3} 
                                    w="full" 
                                    textAlign="center"
                                    _hover={{ bg: 'gray.50', textDecoration: 'none' }}
                                    fontWeight="500"
                                    color="gray.700"
                                >
                                    Home
                                </Link>
                                <Link 
                                    as={NextLink} 
                                    href="/privacypolicy" 
                                    p={3} 
                                    w="full" 
                                    textAlign="center"
                                    _hover={{ bg: 'gray.50', textDecoration: 'none' }}
                                    fontWeight="500"
                                    color="gray.700"
                                >
                                    Privacy Policy
                                </Link>
                                <Link 
                                    as={NextLink} 
                                    href="/contactus" 
                                    p={3} 
                                    w="full" 
                                    textAlign="center"
                                    _hover={{ bg: 'gray.50', textDecoration: 'none' }}
                                    fontWeight="500"
                                    color="gray.700"
                                >
                                    Contact Us
                                </Link>
                            </VStack>
                        </Collapse>
                    )}
                </Flex>
            </Container>
        </Box>
    );
}

export default Navbar;