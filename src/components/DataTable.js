import React, { useState, useEffect } from 'react';
import { Table, Thead, Tbody, Tr, Th, Td, Box } from '@chakra-ui/react';
import { app } from '../firebase'; // Adjust the import path as necessary
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const DataTable = ({ selectedOption }) => {
    const [data, setData] = useState([]);

    useEffect(() => {
        const fetchData = async () => {
            const db = getFirestore(app);
            let querySnapshot;

            switch (selectedOption) {
                case 'Writing':
                    querySnapshot = await getDocs(collection(db, 'writingPassages'));
                    break;
                case 'Listening':
                    querySnapshot = await getDocs(collection(db, 'listeningPassages'));
                    break;
                default: // 'Reading' and other cases
                    querySnapshot = await getDocs(collection(db, 'readingPassages'));
            }

            const fetchedData = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            setData(fetchedData);
        };

        fetchData();
    }, [selectedOption]);

    // Function to determine the color based on difficulty
    const getDifficultyColor = (difficulty) => {
        switch (difficulty) {
            case 'Hard':
                return 'red.500';
            case 'Medium':
                return 'yellow.500';
            case 'Easy':
                return 'green.500';
            default:
                return 'gray.500';
        }
    };

    return (
        <Box overflowX="auto">
            <Table variant="simple">
                <Thead>
                    <Tr>
                        <Th fontWeight="bold">#</Th>
                        <Th fontWeight="bold">Title</Th>
                        <Th fontWeight="bold">Difficulty</Th>
                    </Tr>
                </Thead>
                <Tbody>
                    {data.map((item, index) => (
                        <Tr key={item.id}>
                            <Td>{index + 1}</Td>
                            <Td>{item.passageTitle}</Td>
                            <Td color={getDifficultyColor(item.passageDifficulty)}>{item.passageDifficulty}</Td>
                        </Tr>
                    ))}
                </Tbody>
            </Table>
        </Box>
    );
};

export default DataTable;
