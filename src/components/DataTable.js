import React, { useState, useEffect } from 'react';
import { Table, Thead, Tbody, Tr, Th, Td, Box, Flex, Button } from '@chakra-ui/react';
import { app } from '../firebase';
import { useNavigate } from 'react-router-dom';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import ReadingQuestion from '../pages/ReadingQuestion';

const DataTable = ({ selectedOption }) => {
    const [data, setData] = useState([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const resultsPerPage = 10;
    const navigate = useNavigate(); // Initialize navigate here

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
                default:
                    querySnapshot = await getDocs(collection(db, 'readingPassages'));
            }

            const fetchedData = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            setData(fetchedData);
            setTotalPages(Math.ceil(fetchedData.length / resultsPerPage));
        };

        fetchData();
    }, [selectedOption]);

    const handleRowClick = (id) => {
        if (selectedOption === 'Reading') {
            navigate(`ReadingQuestion/${id}`); // Navigate to ReadingQuestion with the document ID
        }
        // You can add logic for other options if needed
    };

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

    // Pagination controls
    const goToPreviousPage = () => setCurrentPage(page => Math.max(1, page - 1));
    const goToNextPage = () => setCurrentPage(page => Math.min(totalPages, page + 1));

    // Slice data for current page
    const paginatedData = data.slice((currentPage - 1) * resultsPerPage, currentPage * resultsPerPage);

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
                    {paginatedData.map((item, index) => (
                        <Tr 
                        key={item.id} 
                        onClick={() => handleRowClick(item.id)} 
                        cursor="pointer"
                        bg={index % 2 === 0 ? "gray.50" : "white"} // Alternating background color
                    >
                        <Td>{(currentPage - 1) * resultsPerPage + index + 1}</Td>
                        <Td>{item.passageTitle}</Td>
                        <Td color={getDifficultyColor(item.passageDifficulty)}>
                            {item.passageDifficulty}
                        </Td>
                    </Tr>
                    ))}
                </Tbody>
            </Table>
            <Flex justifyContent="center" mt={2}>
                {currentPage > 1 && (
                    <Button onClick={goToPreviousPage} mr={4}>
                        Previous
                    </Button>
                )}
                <Button onClick={goToNextPage} disabled={currentPage === totalPages}>
                    Next
                </Button>
            </Flex>
        </Box>
    );
};

export default DataTable;
