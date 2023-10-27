
process INDEX {
    tag "$transcriptome.simpleName"
    container '523155489867.dkr.ecr.us-west-2.amazonaws.com/rnaseq-nf:1.1.1'
    
    input:
    path transcriptome 

    output:
    path 'index' 

    script:
    """
    echo "Running salmon index"
    salmon index --threads $task.cpus -t $transcriptome -i index
    echo "Command done"
    ls -lR && sleep 60
    """
}
