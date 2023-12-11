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
  Link
} from '@chakra-ui/react';
import { HamburgerIcon } from '@chakra-ui/icons';
import { Link as RouterLink } from 'react-router-dom';

const Navbar = () => {
    const { isOpen, onToggle } = useDisclosure();

    return (
        <Flex as="header" bg="black" p={3} color="white" align="center">
            {/* Logo and Title */}
            <Link as={RouterLink} to="/">
                <Flex align="center">
                    <Box p="1">
                        <Image src="/image.png" alt="Logo" boxSize="50px" />
                    </Box>
                    <Text fontSize="lg" fontWeight="bold" ml={2}>IELTSBank</Text>
                </Flex>
            </Link>

            <Spacer />

            {/* Menu Icon */}
            <IconButton
                icon={<HamburgerIcon color="white"/>}
                variant="outline"
                aria-label="Menu"
                onClick={onToggle}
                colorScheme="whiteAlpha" // This will ensure the icon and border are white
            />

            {/* Expandable Menu Items */}
            <Collapse in={isOpen} animateOpacity>
                <Flex
                    direction="column"
                    bg="black"
                    p={4}
                    rounded="md"
                    shadow="md"
                >
                    {/* Menu items can be added here */}
                    {/*<Text color="white">Sign Up</Text>
                    <Text color="white">Rate My Writing</Text>
                    {/* ... other items */}
                </Flex>
            </Collapse>
        </Flex>
    );
}

export default Navbar;
