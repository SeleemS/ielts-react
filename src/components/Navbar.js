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
  Link
} from '@chakra-ui/react';
import { HamburgerIcon } from '@chakra-ui/icons';
import NextLink from 'next/link';

const Navbar = () => {
    const { isOpen, onToggle } = useDisclosure();

    return (
        <Flex as="header" bg="black" p={3} color="white" align="center" position="relative">
            {/* Logo and Title */}
            <Link as={NextLink} href="/">
                <Flex align="center">
                    <Box p="1">
                        <Image src="/image.png" alt="Logo" boxSize="50px" />
                    </Box>
                    <Text fontSize="lg" fontWeight="bold" ml={2}>IELTS-Bank</Text>
                </Flex>
            </Link>

            <Spacer />

            {/* Menu Icon */}
            <IconButton
                icon={<HamburgerIcon color="white"/>}
                variant="outline"
                aria-label="Menu"
                onClick={onToggle}
                colorScheme="whiteAlpha"
            />

            {/* Expandable Menu Items */}
            {isOpen && (
              <Collapse in={isOpen} animateOpacity>
                    <VStack
                        position="absolute"
                        top="100%"
                        right="0"
                        bg="black"
                        w="200px" // Fixed width for a cleaner look
                        mt={2}
                        rounded="md"
                        shadow="md"
                        zIndex="10"
                        mr = {1}
                    >
                        <Link as={NextLink} href="/" p={2} w="full" textAlign="center">Home</Link>
                        <Link as={NextLink} href="/termsofservice" p={2} w="full" textAlign="center">Privacy Policy</Link>
                        <Link as={NextLink} href="/contactus" p={2} w="full" textAlign="center">Contact Us</Link>
                    </VStack>
                </Collapse>
            )}
        </Flex>
    );
}

export default Navbar;
