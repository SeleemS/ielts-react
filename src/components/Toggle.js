import React, { useState } from 'react';
import { Flex, Button, Box } from '@chakra-ui/react';

const Toggle = ({ onChange }) => {
    const [selected, setSelected] = useState('Reading');
    const options = ['Reading', 'Writing','Speaking'];
    // const options = ['Reading', 'Writing', 'Listening', 'Speaking'];

    const handleSelect = (option) => {
        setSelected(option);
        if (onChange) {
            onChange(option);
        }
    };

    // Calculate the left position for the slider
    const sliderLeft = options.indexOf(selected) * (100 / options.length) + "%";

    return (
        <Flex maxW="90vw" position="relative" border="1px solid" borderColor="gray.200" borderRadius="md" bg="white">
            <Box
                position="absolute"
                left={sliderLeft}
                width={`${100 / options.length}%`}
                bg="black"
                borderRadius="md"
                transition="left 0.3s ease-out"
                height="100%"
            />
            {options.map((option) => (
                <Button
                    flex={1}
                    bg="transparent"
                    color={selected === option ? 'white' : 'gray.600'}
                    fontWeight="bold"
                    borderRadius="md"
                    _hover={{ bg: 'transparent', color: 'white' }}
                    onClick={() => handleSelect(option)}
                    key={option}
                    zIndex="2" // Ensure buttons are above the slider
                >
                    {option}
                </Button>
            ))}
        </Flex>
    );
};

export default Toggle;
