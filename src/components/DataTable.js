import React from 'react';
import {
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Box
} from '@chakra-ui/react';

const DataTable = () => {
    // Ensure data is an array
    const data = [
        { title: 'Reading Comprehension', difficulty: 'Easy' },
        { title: 'Essay Writing', difficulty: 'Medium' },
        { title: 'Listening Test', difficulty: 'Hard' },
        // ... more data
    ];

    return (
        <Box overflowX="auto">
            <Table variant="simple">
                <Thead>
                    <Tr>
                        <Th>#</Th>
                        <Th>Title</Th>
                        <Th>Difficulty</Th>
                    </Tr>
                </Thead>
                <Tbody>
                    {data.map((item, index) => (
                        <Tr key={index}>
                            <Td>{index + 1}</Td>
                            <Td>{item.title}</Td>
                            <Td>{item.difficulty}</Td>
                        </Tr>
                    ))}
                </Tbody>
            </Table>
        </Box>
    );
};

export default DataTable;
